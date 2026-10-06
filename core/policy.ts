import type { HookResult } from './types.js';

interface PolicyInput {
  readonly: boolean;
  read: boolean;
  opaque: boolean;
  review: boolean;
  gate: boolean;
  gateConfigured: boolean;
  branch: string | null;
  branchOperation: boolean;
  shipping: boolean | undefined;
  protectedBranches: string[];
}

interface ApprovalInput {
  kind: string;
  actionKind: string;
  protectedFiles: boolean;
  nativeShell: boolean;
  harness: string;
  branchProtected: boolean;
  toolName: string | undefined;
}

const opaqueReason =
  'This command could not be classified as read-only because of shell substitution, variables or similar syntax. Use a plain read command with literal paths.';

// Pure decisions; runtime owns filesystem evidence, locks, extension execution and IO.
export function evaluatePolicy({
  readonly,
  read,
  opaque,
  review,
  gate,
  gateConfigured,
  branch,
  branchOperation,
  shipping,
  protectedBranches,
}: PolicyInput): HookResult | null {
  if (readonly && !read) {
    return {
      decision: 'deny',
      reason: opaque
        ? opaqueReason
        : 'This session is read-only. Exit plan/review mode before making changes or running project checks.',
    };
  }
  if (read || review) return {};
  if (gate) {
    return gateConfigured ? {} : { decision: 'deny', reason: 'No project gate is configured.' };
  }
  if (branchOperation) return null;
  if (!branch) {
    const reason = 'Check out a branch before changing the project.';
    return {
      decision: 'deny',
      reason: opaque
        ? `Cannot determine the branch. ${opaqueReason} ${reason}`
        : `Cannot determine the branch. ${reason}`,
    };
  }
  if (protectedBranches.includes(branch) && !shipping) {
    return {
      decision: 'deny',
      reason: opaque
        ? `${opaqueReason} For real changes, create a feature or fix branch first.`
        : `No work on protected branch ${branch}. Create a feature or fix branch first.`,
    };
  }
  return null;
}

export function approvalReason({
  kind,
  actionKind,
  protectedFiles,
  nativeShell,
  harness,
  branchProtected,
  toolName,
}: ApprovalInput) {
  if (protectedFiles) {
    return 'This edit changes the workflow, checks or protected project configuration.';
  }
  const nativelyApproved = nativeShell && harness !== 'pi' && !branchProtected;
  if (actionKind === 'shell' && kind !== 'branch' && !nativelyApproved) {
    return 'This shell command can change files, publish changes or execute unclassified code. Review the exact command before approving.';
  }
  if (actionKind === 'unknown') {
    return `Tool ${toolName} is not classified as read-only. Review its arguments before approving.`;
  }
}
