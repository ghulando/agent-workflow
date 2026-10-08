import type {
  Action,
  Project,
  ProjectConfig,
  HookPayload,
  HookResult,
  ParsedCommand,
  Extension,
  ToolInput,
} from './types.ts';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  CONFIG,
  currentBranch,
  findRoot,
  inside,
  loadProject,
  matches,
  projectPath,
} from './project.ts';
import { startupContext } from './context.ts';
import { commands, isShipping, shellKind } from './shell.ts';
import { normalize } from './tools.ts';
import { HOOK_BUDGET, digest, fingerprint, invalidate, sessionKey, withState } from './state.ts';
import { hasReview } from './review.ts';
import { evaluatePolicy } from './policy.ts';
import { parseCommand } from './cli.ts';
import { packageDigest } from './package.ts';
import { claimsDone, completionStatus } from './status.ts';

export const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
// The guard re-parses printed commands and rejects a backslash outside quotes,
// so text with an apostrophe goes in double quotes instead of '\''.
export const quote = (text: string) =>
  text.includes("'") ? '"' + text.replace(/["\\$`]/g, '\\$&') + '"' : "'" + text + "'";

const runnerPath = () => resolve(pluginRoot, 'bin/workflow.ts');

export function gateCommand(key: string) {
  return `node ${quote(runnerPath())} gate ${key}`;
}

// The runner's location differs per harness install, so each session names its own.
export function reviewCall(key: string, harness: string, config: ProjectConfig) {
  if (config.review) {
    return `REVIEW_GATE_SESSION=${key} AGENT_WORKFLOW_RUNNER=${quote(runnerPath())} ${quote(config.review[0]!)} <task-file> ${harness} <reviewer> [round]`;
  }
  return `node ${quote(runnerPath())} review <task-file> --author ${harness} --reviewer <reviewer> --round <n> --gate-session ${key}`;
}

function runnerCall(action: Action, root: string) {
  if (action.kind !== 'shell') return null;
  const parts = commands(action.command);
  if (parts?.length !== 1) return null;
  const [node, runner, verb, ...args] = parts[0]!;
  if (node !== 'node' || !runner) return null;
  const cwd = resolve(action.cwd);
  if (
    cwd !== root &&
    (!isAbsolute(runner) || !['history-plan', 'history-digest', 'history-clean'].includes(verb!))
  ) {
    return null;
  }
  try {
    if (cwd !== root && !inside(root, realpathSync(cwd))) return null;
    const path = realpathSync(resolve(action.cwd, runner));
    if (path !== realpathSync(resolve(pluginRoot, 'bin/workflow.ts'))) {
      const candidate = dirname(dirname(path));
      if (
        path !== resolve(candidate, 'bin/workflow.ts') ||
        packageDigest(candidate) !== packageDigest(pluginRoot)
      ) {
        return null;
      }
    }
    return parseCommand(verb!, args);
  } catch {
    return null;
  }
}

function isGate(call: ParsedCommand | null, key: string) {
  return call?.verb === 'gate' && call.positional[0] === key;
}

// A gate the hook cannot recognize loses its receipt on PostToolUse.
function strandedGate(command: string) {
  const parts = commands(command);
  if (!parts) return /workflow\.ts\S*\s+gate\b/.test(command);
  return (
    parts.length > 1 &&
    parts.some((s) => s[0] === 'node' && s[1]?.endsWith('workflow.ts') && s[2] === 'gate')
  );
}

function isReview(
  call: ParsedCommand | null,
  action: Action,
  key: string,
  root: string,
  harness: string,
  config: ProjectConfig,
) {
  if (call?.verb === 'review') {
    return call.flags.author === harness && call.flags['gate-session'] === key;
  }
  if (action.kind !== 'shell' || resolve(action.cwd) !== root) return false;
  const parts = commands(action.command);
  let p = parts?.[0];
  if (p?.[1]?.startsWith('AGENT_WORKFLOW_RUNNER=')) {
    if (p[1] !== `AGENT_WORKFLOW_RUNNER=${runnerPath()}`) return false;
    p = [p[0]!, ...p.slice(2)];
  }
  return (
    parts?.length === 1 &&
    config.review?.length === 1 &&
    [5, 6].includes(p?.length as number) &&
    p![0]! === `REVIEW_GATE_SESSION=${key}` &&
    resolve(root, p![1]!) === resolve(root, config.review[0]!) &&
    p![3]! === harness &&
    ['claude', 'codex', 'ollama'].includes(p![4]!) &&
    (p!.length === 5 || /^(?:[1-9]|10)$/.test(p![5]!))
  );
}

const READ_VERBS = [
  'task-resume',
  'review-status',
  'doctor',
  'setup',
  'install-plan',
  'history-plan',
  'history-digest',
];

function runnerKind(call: ParsedCommand | null) {
  if (READ_VERBS.includes(call?.verb as string)) return 'read';
  if (call?.verb === 'task-start') return 'branch';
  return null;
}

async function extensions(project: Project) {
  const loaded: Extension[] = [];
  for (const path of project.config.extensions) {
    const file = projectPath(project.root, project.root, path);
    // Configuration and extension modules are trusted project code. Pin the
    // import to its content so a long-running Pi process sees later edits.
    const url = pathToFileURL(resolve(project.root, file));
    url.searchParams.set('version', digest(readFileSync(url, 'utf8')));
    const module = (await import(url.href)) as Extension;
    if (typeof module.pre !== 'function' && typeof module.post !== 'function') {
      throw new Error(`workflow extension has no pre/post export: ${path}`);
    }
    loaded.push(module);
  }
  return loaded;
}

// Edits that could rewrite the agent's own permissions, Git internals or the checks
// behind the done proof still ask.
function protectedPatterns(project: Project) {
  const { root, config } = project;
  const patterns = [
    CONFIG,
    `**/${CONFIG}`,
    '.git',
    '.git/**',
    '**/.git',
    '**/.git/**',
    '.pi/**',
    '.claude/**',
    '.codex/**',
    '.agents/plugins/**',
    ...config.extensions,
  ];
  for (const command of [config.gate, config.review]) {
    if (command && command[0]!.includes('/') && inside(root, resolve(root, command[0]!))) {
      patterns.push(projectPath(root, root, command[0]!));
    }
    // Scripts handed to an interpreter, as in ["node", "scripts/check.ts"].
    for (const arg of command?.slice(1) ?? []) {
      const file = resolve(root, arg);
      if (inside(root, file) && existsSync(file) && statSync(file).isFile()) {
        patterns.push(projectPath(root, root, arg));
      }
    }
  }
  return patterns;
}

function readonlyMode(payload: HookPayload) {
  return (
    payload.permission_mode === 'plan' ||
    process.env.AGENT_WORKFLOW_REVIEW === '1' ||
    process.env.PI_REVIEW === '1'
  );
}

export async function handle(harness: string | undefined, raw: unknown): Promise<HookResult> {
  if (!harness || !['pi', 'claude', 'codex'].includes(harness)) throw new Error('unknown harness');
  if (!raw || typeof raw !== 'object' || typeof (raw as HookPayload).cwd !== 'string') {
    throw new Error('hook requires a cwd');
  }
  const payload = raw as HookPayload;
  const event = payload.hook_event_name;
  const deadline = Date.now() + HOOK_BUDGET;
  const approval =
    event === 'UserPromptSubmit' &&
    typeof payload.prompt === 'string' &&
    payload.prompt.trim().match(/^approve workflow ([a-f0-9]{64})$/);
  // Ordinary prompts must remain usable even when project configuration is broken.
  if (event === 'UserPromptSubmit' && !approval) return {};
  // A personal install loads these hooks in every session; there is no project to guard here.
  if (!findRoot(payload.cwd)) return {};
  const project = loadProject(payload.cwd);
  const { root, config } = project;
  const key = sessionKey(root, harness, payload.session_id);
  if (event === 'SessionStart') {
    return {
      context: startupContext(
        project,
        key,
        gateCommand(key),
        reviewCall(key, harness, config),
        harness,
      ),
    };
  }
  if (event === 'UserPromptSubmit') {
    return withState(root, key, (state) => {
      const pending = state.pending;
      if (
        !pending ||
        pending.id !== (approval as RegExpMatchArray)[1] ||
        pending.tree !== fingerprint(root, undefined, deadline) ||
        Date.now() - pending.at > 600000
      ) {
        return {
          context:
            'Workflow approval is missing, stale or expired. Retry the original operation to request a fresh approval.',
        };
      }
      state.approved = pending.id;
      return {
        context: `Approved workflow request ${pending.id}, once. Retry the exact original operation.`,
      };
    });
  }
  if (!['PreToolUse', 'PostToolUse'].includes(event as string)) {
    throw new Error(`unsupported workflow event: ${event}`);
  }
  const action = normalize(project, payload);
  if (action.kind === 'outside') return {};
  // Each team file has one writer, named by its prefix; everyone may read it.
  if (action.kind === 'workspace') {
    const foreign =
      event === 'PreToolUse' &&
      action.paths.find((path) => !basename(path).startsWith(`${harness}-`));
    return foreign
      ? {
          decision: 'deny',
          reason: `${basename(foreign)} in the task workspace is not yours. Write only ${harness}-<topic>.md files there.`,
        }
      : {};
  }
  const call = runnerCall(action, root);
  const gate = isGate(call, key);
  const review = isReview(call, action, key, root, harness, config);
  const runner = runnerKind(call);
  const modules = await extensions(project);

  // The gate receipt names a tree fingerprint, so completion needs no per-command invalidation.
  if (event === 'PostToolUse') {
    const notes = [];
    if (!payload.is_error) {
      for (const module of modules) {
        if (module.post) {
          const context = await module.post({ root, config, action });
          if (context) notes.push(context);
        }
      }
    }
    return notes.length ? { context: notes.join('\n') } : {};
  }

  if (action.kind === 'shell' && !gate && strandedGate(action.command)) {
    return {
      decision: 'deny',
      reason:
        'Run the gate as a plain command on its own, with your session key: node <runner> gate <session-key>. Inside a pipeline, chain or redirect it is not recognized.',
    };
  }

  return withState(root, key, async (state) => {
    let kind =
      runner ??
      (action.kind === 'shell'
        ? shellKind(action.command, config.readCommands, root, action.cwd)
        : action.kind);
    // Checkout also accepts file paths. Only existing local branch names are a
    // safe branch exemption; otherwise it could restore files on main.
    if (kind === 'branch' && action.kind === 'shell') {
      for (const segment of commands(action.command)!) {
        if (segment[0] === 'git' && segment[1] === 'checkout' && segment.length === 3) {
          const ref = spawnSync(
            'git',
            ['show-ref', '--verify', '--quiet', `refs/heads/${segment[2]}`],
            { cwd: action.cwd, timeout: 10000 },
          );
          if (ref.status !== 0) kind = 'mutation';
        }
      }
    }
    const read = kind === 'read';
    const branch = currentBranch(root);
    const shellParts = action.kind === 'shell' ? commands(action.command) : null;
    // git branch -d refuses a branch that is not merged, so cleanup after a merge ships too.
    const approvedShipping =
      shellParts?.length === 1 &&
      shellParts[0]![0] === 'git' &&
      (['merge', 'push'].includes(shellParts[0]![1]!) ||
        (shellParts[0]!.length === 4 &&
          shellParts[0]![1] === 'branch' &&
          shellParts[0]![2] === '-d' &&
          /^[A-Za-z0-9][\w./-]*$/.test(shellParts[0]![3]!)));
    const decision = evaluatePolicy({
      readonly: readonlyMode(payload),
      read,
      opaque: kind === 'opaque',
      review,
      gate,
      gateConfigured: Boolean(config.gate),
      branch,
      branchOperation: kind === 'branch' || call?.verb === 'history-clean',
      shipping: approvedShipping,
      protectedBranches: config.protectedBranches,
    });
    if (decision) return decision;
    const done = claimsDone(action, config);
    let tree: string | undefined;
    const getTree = () => (tree ??= fingerprint(root, undefined, deadline));
    if (done && getTree() !== state.pass?.tree) {
      return {
        decision: 'deny',
        reason: `Run the full configured gate on this tree first: ${gateCommand(key)}`,
      };
    }
    if (done && config.workflow.requireReview && action.kind === 'files') {
      if (action.files.length !== 1) {
        return {
          decision: 'deny',
          reason:
            'Mark one task done in a separate status-only edit; do not combine completion with code changes.',
        };
      }
      for (const file of action.files) {
        if (
          file.after !==
          file.before.replace(/^\*\*Status:\*\*[^\n]*$/m, () => completionStatus(config.doneMarker))
        ) {
          return {
            decision: 'deny',
            reason:
              'Update task notes before final verification. The completion edit may change only task status.',
          };
        }
        if (!(await hasReview(project, file.path, getTree()))) {
          return {
            decision: 'deny',
            reason: 'Get a passing independent review on this tree before marking done.',
          };
        }
      }
    }
    for (const module of modules) {
      if (!module.pre) continue;
      const reason = await module.pre({ root, config, action });
      if (reason) return { decision: 'deny', reason: reason as string };
    }
    const reason =
      action.kind === 'files' &&
      action.files.some((file) => matches(file.path, protectedPatterns(project)))
        ? 'This edit changes Git metadata, harness settings, or the workflow configuration and checks.'
        : call?.verb === 'history-clean'
          ? 'This deletes harness session history. Review the plan before approving.'
          : (action.kind === 'shell' && (approvedShipping || isShipping(action.command))) ||
              // Codex can type a command into a shell it already started.
              (payload.tool_name === 'write_stdin' &&
                isShipping(String((payload.tool_input as ToolInput | undefined)?.chars ?? '')))
            ? 'This command commits, merges, pushes or publishes. Review the exact command before approving.'
            : undefined;
    if (!reason) return {};
    const requestTree = getTree();
    const request = digest([
      harness,
      key,
      payload.tool_name,
      payload.tool_input,
      action,
      requestTree,
      state.revision,
    ]);
    if (
      state.approved !== request ||
      state.pending?.id !== request ||
      Date.now() - state.pending.at > 600000
    ) {
      state.pending = { id: request, tree: requestTree, at: Date.now() };
      return { decision: 'ask', reason, request };
    }
    // The approval is one-use. The gate receipt stays bound to its tree fingerprint.
    state.pending = null;
    state.approved = null;
    return {};
  });
}

export async function runGate(cwd: string, key: string) {
  const project = loadProject(cwd);
  const { root, config } = project;
  if (!config.gate) throw new Error('no project gate configured');
  const before = fingerprint(root);
  const run = randomUUID();
  const revision = await withState(root, key, (state) => {
    invalidate(state);
    state.gate = run;
    return state.revision;
  });
  const result = spawnSync(config.gate[0]!, config.gate.slice(1), {
    cwd: root,
    stdio: 'inherit',
    timeout: 20 * 60 * 1000,
    shell: false,
  });
  const after = fingerprint(root);
  const passed = await withState(root, key, (state) => {
    if (result.status !== 0 || result.error) return 'checks failed or timed out';
    if (before !== after) return 'source tree changed during checks';
    if (state.revision !== revision || state.gate !== run) {
      return 'overlapped a guarded mutation or unclassified tool';
    }
    state.pass = { tree: after, command: config.gate!, at: new Date().toISOString() };
    state.gate = null;
    return true;
  });
  if (passed !== true) throw new Error(`gate failed: ${passed}; fix the cause and rerun`);
  process.stdout.write('workflow: gate passed on the current tree\n');
}
