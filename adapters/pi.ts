import type { ExtensionAPI, ExtensionContext, ToolEvent } from '@earendil-works/pi-coding-agent';
import { handle } from '../core/runtime.js';
import planMode from './plan-ui.js';

// The factory needs no Pi runtime import: Pi supplies this API to the package.
export default function workflow(pi: ExtensionAPI) {
  // Pi gives each extension a different API object but shares runtime flag
  // values. Check before setting the default so a second package copy is inert.
  const marker = 'agent-workflow-loaded';
  pi.registerFlag(marker, {
    type: 'boolean',
    description: 'Internal workflow registration marker',
  });
  if (pi.getFlag(marker) === true) return;
  pi.registerFlag(marker, {
    type: 'boolean',
    default: true,
    description: 'Internal workflow registration marker',
  });
  let plan = false;
  planMode(pi, (enabled) => {
    plan = enabled;
  });
  const payload = (ctx: ExtensionContext, event: Partial<ToolEvent>, name: string) => ({
    cwd: ctx.cwd,
    session_id: ctx.sessionManager.getSessionId(),
    hook_event_name: name,
    permission_mode: plan ? 'plan' : 'default',
    tool_name: event.toolName,
    tool_input: event.input,
    is_error: event.isError,
  });
  pi.on('before_agent_start', async (_event, ctx) => {
    const result = await handle('pi', payload(ctx, {}, 'SessionStart'));
    if (!result.context) return;
    return {
      message: {
        customType: 'agent-workflow-context',
        content:
          result.context +
          (plan
            ? '\nPlan mode is active. Investigate and propose a plan; the user must exit /plan before implementation.'
            : ''),
        display: false,
      },
    };
  });
  pi.on('context', async (event) => {
    const last = event.messages.findLastIndex(
      (message) => message.customType === 'agent-workflow-context',
    );
    return {
      messages: event.messages.filter(
        (message, i) => message.customType !== 'agent-workflow-context' || i === last,
      ),
    };
  });
  pi.on('input', async (event, ctx) => {
    if (event.source === 'extension') return;
    const result = await handle('pi', {
      ...payload(ctx, {}, 'UserPromptSubmit'),
      prompt: event.text,
    });
    if (result.context) {
      pi.sendMessage({
        customType: 'agent-workflow-approval',
        content: result.context,
        display: true,
      });
    }
  });
  pi.on('tool_call', async (event, ctx) => {
    try {
      const input = payload(ctx, event, 'PreToolUse');
      let result = await handle('pi', input);
      if (result.decision === 'ask' && ctx.hasUI) {
        const once = 'Yes, once';
        const session = 'Yes, for this session (this exact operation)';
        const choice = await ctx.ui.select(
          `Approve workflow operation?\n${result.reason}\n\n${event.toolName}\n${JSON.stringify(event.input, null, 2)}`,
          [once, ...(result.session ? [session] : []), 'No'],
        );
        if (choice === once || choice === session) {
          await handle('pi', {
            ...payload(ctx, {}, 'UserPromptSubmit'),
            prompt: `approve workflow ${result.request}${choice === session ? ' for this session' : ''}`,
          });
          result = await handle('pi', input);
        }
      }
      if (result.decision) {
        return {
          block: true,
          reason:
            result.reason + (result.request ? `\nSend: approve workflow ${result.request}` : ''),
        };
      }
    } catch (err) {
      return { block: true, reason: `agent-workflow: ${(err as Error).message}` };
    }
  });
  pi.on('tool_result', async (event, ctx) => {
    try {
      const result = await handle('pi', payload(ctx, event, 'PostToolUse'));
      if (result.context) {
        return { content: [...event.content, { type: 'text', text: result.context }] };
      }
    } catch (err) {
      return {
        content: [
          ...event.content,
          { type: 'text', text: `agent-workflow: ${(err as Error).message}` },
        ],
      };
    }
  });
}
