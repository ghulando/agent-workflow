import type { HookPayload, ToolInput } from '../core/types.ts';

// Grok and Cursor send their own hook payloads. This maps them onto the Claude-shaped
// HookPayload the engine reads, so core policy stays the same for every harness.

type Raw = Record<string, unknown>;

const text = (...values: unknown[]) =>
  values.find((value) => typeof value === 'string') as string | undefined;

// Grok also loads Claude hooks and ~/.cursor/hooks.json, and Cursor can load Claude
// hooks, so one tool call may reach several Halvard entries.
export function hostHarness(raw: unknown, env: NodeJS.ProcessEnv = process.env) {
  if (env.GROK_HOOK_EVENT) return 'grok';
  const payload = raw && typeof raw === 'object' ? (raw as Raw) : {};
  if (
    typeof payload.cursor_version === 'string' ||
    (typeof payload.conversation_id === 'string' && Array.isArray(payload.workspace_roots))
  ) {
    return 'cursor';
  }
  return null;
}

// Canonical file-tool input, whatever each host calls its fields.
function fileInput(input: Raw): ToolInput {
  return {
    file_path: text(input.file_path, input.path, input.target_file, input.filePath, input.file),
    old_string: text(input.old_string, input.old_str, input.oldText, input.old),
    new_string: text(input.new_string, input.new_str, input.newText, input.new),
    content: text(input.content, input.contents, input.file_text, input.text),
    ...((input.replace_all ?? input.replaceAll) === true ? { replace_all: true } : {}),
  };
}

function shellInput(input: Raw): ToolInput {
  return {
    command: text(input.command, input.cmd),
    ...(text(input.cwd, input.workdir, input.working_directory) !== undefined
      ? { cwd: text(input.cwd, input.workdir, input.working_directory) }
      : {}),
  };
}

// An edit the guard cannot preview: the host sent no exact old and new text.
function editTool(input: ToolInput): [string, ToolInput] {
  if (input.old_string && input.new_string !== undefined) return ['Edit', input];
  // An empty old string creates the file with the new text.
  if (input.old_string === '' && input.new_string !== undefined) {
    return ['Write', { file_path: input.file_path, content: input.new_string }];
  }
  if (input.content !== undefined && !input.old_string) return ['Write', input];
  return ['OpaqueEdit', { file_path: input.file_path }];
}

const SHELL = new Set(['run_terminal_command', 'run_terminal_cmd', 'Shell', 'shell']);
const READS = new Set([
  'read_file',
  'grep',
  'grep_search',
  'list_dir',
  'list_directory',
  'glob',
  'glob_file_search',
  'file_search',
  'find_files',
  'codebase_search',
  'semantic_search',
  'web_search',
  'web_fetch',
  'todo_write',
  'update_todos',
  'read_lints',
]);
const WRITES = new Set(['write_file', 'create_file', 'Write']);
const EDITS = new Set(['search_replace', 'edit_file', 'StrReplace', 'MultiEdit', 'Edit']);
const DELETES = new Set(['delete_file', 'Delete']);
const AGENTS = new Set(['spawn_subagent', 'Task', 'task']);

// Maps one host tool call onto the Claude tool name and input the engine knows.
export function canonicalTool(name: string, raw: unknown): [string, ToolInput | string] {
  // A host may send the input as a JSON string.
  if (typeof raw === 'string' && /^\s*\{/.test(raw)) {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {}
  }
  if (typeof raw === 'string') return [name, raw];
  const input = (raw && typeof raw === 'object' ? raw : {}) as Raw;
  if (SHELL.has(name)) return ['Bash', shellInput(input)];
  if (READS.has(name) || name === 'Read' || name === 'Grep') return ['Read', input];
  if (WRITES.has(name)) {
    const file = fileInput(input);
    return file.content === undefined
      ? ['OpaqueEdit', { file_path: file.file_path }]
      : ['Write', file];
  }
  if (EDITS.has(name)) return editTool(fileInput(input));
  // A delete has no preview; the guard checks its path like an edit it cannot preview.
  if (DELETES.has(name)) return ['OpaqueEdit', { file_path: fileInput(input).file_path }];
  if (AGENTS.has(name)) {
    return [
      'Task',
      { subagent_type: text(input.subagent_type, input.subagentType, input.agent_type) },
    ];
  }
  return [name, input];
}

const GROK_EVENTS: Record<string, string> = {
  session_start: 'SessionStart',
  user_prompt_submit: 'UserPromptSubmit',
  pre_tool_use: 'PreToolUse',
  post_tool_use: 'PostToolUse',
};

function grokPayload(raw: Raw): HookPayload | null {
  const event =
    text(raw.hook_event_name) ?? GROK_EVENTS[text(raw.hookEventName) ?? ''] ?? undefined;
  const name = text(raw.toolName, raw.tool_name);
  const [tool, input] = name
    ? canonicalTool(name, raw.toolInput ?? raw.tool_input)
    : [undefined, undefined];
  return {
    cwd: text(raw.cwd, raw.workspaceRoot) as string,
    session_id: raw.sessionId ?? raw.session_id,
    hook_event_name: event,
    tool_name: tool,
    tool_input: input,
    tool_use_id: raw.toolUseId ?? raw.tool_use_id,
    permission_mode: text(raw.permissionMode, raw.permission_mode),
    prompt: text(raw.prompt, raw.userPrompt, raw.user_prompt),
    is_error: raw.is_error === true || raw.isError === true,
  };
}

// Cursor sends shell commands to both preToolUse and beforeShellExecution. Halvard
// registers both and reads shell from beforeShellExecution only, so a one-use approval
// is not spent twice on the same command.
function cursorPayload(raw: Raw): HookPayload | null {
  const roots = Array.isArray(raw.workspace_roots) ? raw.workspace_roots : [];
  const root = text(roots[0], raw.cwd);
  const mode = text(raw.composer_mode, raw.permission_mode);
  const base = {
    cwd: root as string,
    session_id: raw.conversation_id ?? raw.session_id,
    permission_mode: mode === 'plan' || mode === 'ask' ? 'plan' : mode,
  };
  switch (raw.hook_event_name) {
    case 'sessionStart':
      return { ...base, hook_event_name: 'SessionStart' };
    case 'beforeSubmitPrompt':
      return { ...base, hook_event_name: 'UserPromptSubmit', prompt: text(raw.prompt) };
    case 'beforeShellExecution':
    case 'afterShellExecution':
      return {
        ...base,
        hook_event_name:
          raw.hook_event_name === 'beforeShellExecution' ? 'PreToolUse' : 'PostToolUse',
        tool_name: 'Bash',
        tool_input: shellInput(raw),
      };
    case 'preToolUse':
    case 'postToolUse': {
      const name = text(raw.tool_name) ?? '';
      const [tool, input] = canonicalTool(name, raw.tool_input);
      if (tool === 'Bash') return null;
      return {
        ...base,
        hook_event_name: raw.hook_event_name === 'preToolUse' ? 'PreToolUse' : 'PostToolUse',
        tool_name: tool,
        tool_input: input,
        tool_use_id: raw.tool_use_id,
        is_error: raw.is_error === true,
      };
    }
    default:
      return null;
  }
}

// Returns null for an event this harness's entry deliberately leaves to another one.
export function toHookPayload(harness: string | undefined, raw: unknown): HookPayload | null {
  if (!raw || typeof raw !== 'object') return raw as HookPayload;
  if (harness === 'grok') return grokPayload(raw as Raw);
  if (harness === 'cursor') return cursorPayload(raw as Raw);
  return raw as HookPayload;
}
