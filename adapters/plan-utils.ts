import type { Todo } from '@earendil-works/pi-coding-agent';

function cleanStepText(text: string) {
  let cleaned = text
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1') // remove bold/italic
    .replace(/`([^`]+)`/g, '$1') // remove code spans
    .replace(
      /^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  if (cleaned.length > 50) {
    cleaned = `${cleaned.slice(0, 47)}...`;
  }
  return cleaned;
}

export function extractTodoItems(message: string): Todo[] {
  const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
  if (!headerMatch) return [];
  let planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
  // Numbered lines inside fenced code blocks are examples, not steps.
  planSection = planSection.replace(/```[\s\S]*?```/g, '');
  const items = [];
  const seen = new Set<number>();
  // Top-level numbered lines only (≤2 spaces of indent): nested sub-lists
  // would desync the model's [DONE:n] numbering from the widget. The step
  // number is the one the model wrote, not a renumbering.
  for (const match of planSection.matchAll(/^ {0,2}(\d+)[.)]\s+(.+)$/gm)) {
    const step = Number(match[1]);
    const raw = match[2]!.trim();
    if (raw.length <= 5 || seen.has(step)) continue;
    const display = cleanStepText(raw);
    if (display.length <= 3) continue;
    seen.add(step);
    items.push({ step, raw, display, completed: false });
  }
  return items;
}

function extractDoneSteps(message: string) {
  const steps = [];
  for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
    const step = Number(match[1]);
    if (Number.isFinite(step)) steps.push(step);
  }
  return steps;
}

export function markCompletedSteps(text: string, items: Todo[]) {
  const doneSteps = extractDoneSteps(text);
  for (const step of doneSteps) {
    const item = items.find((t) => t.step === step);
    if (item) item.completed = true;
  }
  return doneSteps.length;
}

// Older sessions persisted {step, text}; map either shape to the raw/display
// split so resume keeps working across the format change.
export function normalizeTodos(todos: unknown): Todo[] {
  if (!Array.isArray(todos)) return [];
  const out = [];
  for (const t of todos as unknown[]) {
    if (typeof t !== 'object' || t === null) continue;
    const o = t as Record<string, unknown>;
    const raw = typeof o.raw === 'string' ? o.raw : typeof o.text === 'string' ? o.text : '';
    if (raw === '' || typeof o.step !== 'number') continue;
    const display = typeof o.display === 'string' ? o.display : cleanStepText(raw) || raw;
    out.push({ step: o.step, raw, display, completed: o.completed === true });
  }
  return out;
}
