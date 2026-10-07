import type { HookResult } from '../core/types.ts';

export function hookOutput(
  harness: string | undefined,
  event: string | undefined,
  result: HookResult,
) {
  if (result.decision) {
    const reason = result.request
      ? `${result.reason}\nTo approve this one operation, send exactly: approve workflow ${result.request}`
      : result.reason;
    return {
      hookSpecificOutput: {
        hookEventName: event,
        permissionDecision:
          harness === 'codex' && result.decision === 'ask' ? 'deny' : result.decision,
        permissionDecisionReason: reason,
      },
    };
  }
  if (result.context) {
    return { hookSpecificOutput: { hookEventName: event, additionalContext: result.context } };
  }
  return {};
}
