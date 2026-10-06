import type { Message } from '@earendil-works/pi-coding-agent';
// Keep message inspection independent of the harness runtime.

export function isAssistantMessage(m: Message) {
  return m.role === 'assistant';
}

export function getTextContent(message: Message) {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as unknown[])
    .filter((block) => (block as { type?: unknown }).type === 'text')
    .map((block) => (block as { text?: string }).text ?? '')
    .join('\n');
}
