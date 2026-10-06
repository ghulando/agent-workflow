import type { ExtensionAPI, ExtensionContext, Todo } from '@earendil-works/pi-coding-agent';
import { Key } from '@earendil-works/pi-tui';
import { getTextContent, isAssistantMessage } from './messages.js';
import { extractTodoItems, markCompletedSteps, normalizeTodos } from './plan-utils.js';

const DISABLED_TOOLS = new Set(['edit', 'write']);

// Custom message types this extension injects. before_agent_start appends one
// per turn, so they accumulate in the session; the context handler keeps only
// the one that is current and drops the rest from the LLM's view (they stay in
// the session file for display/replay).
const INJECTED = new Set([
  'plan-mode-context',
  'plan-execution-context',
  'plan-mode-execute',
  'plan-todo-list',
  'plan-complete',
]);

export default function planMode(pi: ExtensionAPI, setPlan: (enabled: boolean) => void) {
  let enabled = false;
  let executing = false;
  let todoItems: Todo[] = [];
  let toolsBefore: string[] | undefined;
  pi.registerFlag('plan', {
    description: 'Start in plan mode (read-only exploration)',
    type: 'boolean',
    default: false,
  });
  function applyTools() {
    if (toolsBefore === undefined) toolsBefore = pi.getActiveTools();
    pi.setActiveTools(toolsBefore.filter((t) => !DISABLED_TOOLS.has(t)));
  }
  function restoreTools() {
    if (toolsBefore) {
      pi.setActiveTools(toolsBefore);
    } else {
      // toolsBefore lost (e.g. stale persisted state): re-add the disabled
      // tools rather than leaving plan-mode restrictions latched "off".
      pi.setActiveTools([...new Set([...pi.getActiveTools(), ...DISABLED_TOOLS])]);
    }
    toolsBefore = undefined;
  }
  function updateStatus(ctx: ExtensionContext) {
    if (executing && todoItems.length > 0) {
      const completed = todoItems.filter((t) => t.completed).length;
      ctx.ui.setStatus('plan-mode', ctx.ui.theme.fg('accent', `${completed}/${todoItems.length}`));
    } else if (enabled) {
      ctx.ui.setStatus('plan-mode', ctx.ui.theme.fg('warning', 'plan'));
    } else {
      ctx.ui.setStatus('plan-mode', undefined);
    }
    if (executing && todoItems.length > 0) {
      const lines = todoItems.map((item) => {
        if (item.completed) {
          return (
            ctx.ui.theme.fg('success', '[x] ') +
            ctx.ui.theme.fg('muted', ctx.ui.theme.strikethrough(item.display))
          );
        }
        return `${ctx.ui.theme.fg('muted', '[ ] ')}${item.display}`;
      });
      ctx.ui.setWidget('plan-todos', lines);
    } else {
      ctx.ui.setWidget('plan-todos', undefined);
    }
  }
  function persist() {
    pi.appendEntry('plan-mode', {
      enabled,
      executing,
      todos: todoItems,
      toolsBefore,
    });
  }
  // Entering plan mode mid-execution throws away the todo progress — make
  // that a decision, not an accident.
  async function confirmToggle(ctx: ExtensionContext) {
    if (!enabled && executing && todoItems.length > 0 && ctx.hasUI) {
      const remaining = todoItems.filter((t) => !t.completed).length;
      const ok = await ctx.ui.confirm(
        'Abandon plan execution?',
        `${remaining} of ${todoItems.length} steps are still open — entering plan mode discards the progress tracking. Continue?`,
      );
      if (!ok) return;
    }
    toggle(ctx);
  }
  function toggle(ctx: ExtensionContext) {
    enabled = !enabled;
    setPlan(enabled);
    executing = false;
    todoItems = [];
    if (enabled) {
      applyTools();
      ctx.ui.notify(
        "Plan mode ON — read-only. I'll investigate and propose a plan; /plan to exit and implement.",
        'info',
      );
    } else {
      restoreTools();
      ctx.ui.notify('Plan mode OFF — full access restored.', 'info');
    }
    updateStatus(ctx);
    persist();
  }
  pi.registerCommand('plan', {
    description: 'Toggle plan mode (read-only exploration)',
    handler: async (_args, ctx) => confirmToggle(ctx),
  });
  pi.registerCommand('todos', {
    description: 'Show current plan todo list',
    handler: async (_args, ctx) => {
      if (todoItems.length === 0) {
        ctx.ui.notify('No todos. Create a plan first with /plan', 'info');
        return;
      }
      const list = todoItems
        .map((item) => `${item.step}. ${item.completed ? '✓' : '○'} ${item.display}`)
        .join('\n');
      ctx.ui.notify(`Plan Progress:\n${list}`, 'info');
    },
  });
  pi.registerShortcut(Key.ctrlAlt('p'), {
    description: 'Toggle plan mode',
    handler: async (ctx) => confirmToggle(ctx),
  });
  pi.on('context', async (event) => {
    // The only injected message that should reach the model is the latest one
    // of the currently-active kind; everything else is a leftover that would
    // contradict the current state ("[EXECUTING PLAN]" after the plan is done).
    const activeType = enabled
      ? 'plan-mode-context'
      : executing
        ? 'plan-execution-context'
        : undefined;
    const lastIdx = new Map<string, number>();
    event.messages.forEach((m, i) => {
      const t = m.customType;
      if (t !== undefined && INJECTED.has(t)) lastIdx.set(t, i);
    });
    return {
      messages: event.messages.filter((m, i) => {
        const msg = m;
        if (msg.customType !== undefined && INJECTED.has(msg.customType)) {
          if (msg.customType === activeType) return i === lastIdx.get(msg.customType);
          // The execute instruction is the task statement — keep the latest
          // while the plan is actually being executed.
          if (executing && msg.customType === 'plan-mode-execute') {
            return i === lastIdx.get(msg.customType);
          }
          return false;
        }
        return true;
      }),
    };
  });
  pi.on('before_agent_start', async () => {
    if (enabled) {
      return {
        message: {
          customType: 'plan-mode-context',
          content:
            '[PLAN MODE] Read-only. edit/write are disabled and bash is limited to ' +
            'read-only commands. Investigate and lay out an implementation/fix plan ' +
            'in your reply. Do NOT attempt changes — to implement, the user exits ' +
            'plan mode first.\n\n' +
            'Create a detailed numbered plan under a "Plan:" header:\n\n' +
            'Plan:\n' +
            '1. First step description\n' +
            '2. Second step description\n' +
            '...',
          display: false,
        },
      };
    }
    if (executing && todoItems.length > 0) {
      const remaining = todoItems.filter((t) => !t.completed);
      // Full step text, not the widget's truncated form — this is the spec the
      // model executes from.
      const todoList = remaining.map((t) => `${t.step}. ${t.raw}`).join('\n');
      return {
        message: {
          customType: 'plan-execution-context',
          content:
            `[EXECUTING PLAN — full tool access enabled]\n\n` +
            `Remaining steps:\n${todoList}\n\n` +
            `Execute each step in order.\n` +
            `After completing a step, include a [DONE:n] tag in your response.`,
          display: false,
        },
      };
    }
  });
  pi.on('turn_end', async (event, ctx) => {
    if (!executing || todoItems.length === 0) return;
    const msg = event.message;
    if (!isAssistantMessage(msg)) return;
    const text = getTextContent(msg);
    if (markCompletedSteps(text, todoItems) > 0) {
      updateStatus(ctx);
    }
    persist();
  });
  pi.on('agent_end', async (event, ctx) => {
    if (executing && todoItems.length > 0) {
      if (todoItems.every((t) => t.completed)) {
        const completedList = todoItems.map((t) => `~~${t.display}~~`).join('\n');
        pi.sendMessage(
          {
            customType: 'plan-complete',
            content: `**Plan Complete!** ✓\n\n${completedList}`,
            display: true,
          },
          { triggerTurn: false },
        );
        executing = false;
        todoItems = [];
        updateStatus(ctx);
        persist();
      }
      return;
    }
    if (!enabled || !ctx.hasUI) return;
    // Only prompt when THIS turn produced a plan — otherwise every follow-up
    // answer in plan mode re-opens the dialog on the stale plan.
    const lastAssistant = [...event.messages].reverse().find((m) => isAssistantMessage(m));
    if (!lastAssistant) return;
    const extracted = extractTodoItems(getTextContent(lastAssistant));
    if (extracted.length === 0) return;
    todoItems = extracted;
    persist();
    const todoListText = todoItems.map((t) => `${t.step}. [ ] ${t.display}`).join('\n');
    const planTodoListMessage = {
      customType: 'plan-todo-list',
      content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`,
      display: true,
    };
    const choice = await ctx.ui.select('Plan mode — what next?', [
      'Execute the plan (track progress)',
      'Stay in plan mode',
      'Refine the plan',
    ]);
    if (choice?.startsWith('Execute')) {
      const firstTodo = todoItems[0];
      if (!firstTodo) return;
      enabled = false;
      setPlan(false);
      executing = true;
      restoreTools();
      updateStatus(ctx);
      persist();
      // Same rule as before_agent_start: the model gets the full step text.
      const remainingList = todoItems.map((t) => `${t.step}. ${t.raw}`).join('\n');
      const execMessage =
        `Execute the plan.\n\n` +
        `Remaining steps:\n${remainingList}\n\n` +
        `Start with: ${firstTodo.raw}\n` +
        `After completing a step, include a [DONE:n] tag in your response.`;
      pi.sendMessage(planTodoListMessage, { deliverAs: 'followUp' });
      pi.sendMessage(
        { customType: 'plan-mode-execute', content: execMessage, display: true },
        { triggerTurn: true, deliverAs: 'followUp' },
      );
    } else if (choice === 'Refine the plan') {
      const refinement = await ctx.ui.editor('Refine the plan:', '');
      if (refinement?.trim()) {
        pi.sendMessage(planTodoListMessage, { deliverAs: 'followUp' });
        pi.sendUserMessage(refinement.trim(), { deliverAs: 'followUp' });
      }
    }
  });
  pi.on('session_start', async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const last = entries.filter((e) => e.type === 'custom' && e.customType === 'plan-mode').pop();
    if (last?.data) {
      enabled = last.data.enabled ?? enabled;
      executing = last.data.executing ?? executing;
      todoItems = normalizeTodos(last.data.todos);
      toolsBefore = last.data.toolsBefore ?? toolsBefore;
    }
    // The flag wins over persisted state: `pi --continue --plan` means plan
    // mode NOW, even if the resumed session had toggled it off (a persisted
    // `enabled: false` must not override an explicit request).
    if (pi.getFlag('plan') === true) enabled = true;
    // On resume during execution, re-scan messages for [DONE:n] markers
    // that were added after the last plan-mode-execute entry.
    if (executing && todoItems.length > 0) {
      let executeIndex = -1;
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i]!;
        if (entry.customType === 'plan-mode-execute') {
          executeIndex = i;
          break;
        }
      }
      const messages = [];
      for (let i = executeIndex + 1; i < entries.length; i++) {
        const entry = entries[i]!;
        if (entry.type === 'message' && entry.message && isAssistantMessage(entry.message)) {
          messages.push(entry.message);
        }
      }
      const allText = messages.map(getTextContent).join('\n');
      markCompletedSteps(allText, todoItems);
    }
    setPlan(enabled);
    if (enabled) applyTools();
    updateStatus(ctx);
  });
}
