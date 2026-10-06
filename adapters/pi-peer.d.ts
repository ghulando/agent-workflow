// Only the host surface used by these adapters; Pi supplies the runtime peers.
declare module '@earendil-works/pi-tui' {
  export const Key: { ctrlAlt(key: string): string };
}

declare module '@earendil-works/pi-coding-agent' {
  export interface Message {
    role?: string;
    customType?: string;
    content?: unknown;
  }
  export interface Todo {
    step: number;
    raw: string;
    display: string;
    completed: boolean;
  }
  export interface PlanState {
    enabled: boolean;
    executing: boolean;
    todos: Todo[];
    toolsBefore: string[] | undefined;
  }
  export interface SessionEntry {
    type: string;
    customType?: string;
    data?: Partial<PlanState>;
    message?: Message;
  }
  export interface ExtensionContext {
    cwd: string;
    hasUI: boolean;
    sessionManager: { getSessionId(): string; getEntries(): SessionEntry[] };
    ui: {
      confirm(title: string, text: string): Promise<boolean>;
      select(title: string, options: string[]): Promise<string | undefined>;
      editor(title: string, text: string): Promise<string | undefined>;
      notify(text: string, level: string): void;
      setStatus(name: string, text: string | undefined): void;
      setWidget(name: string, lines: string[] | undefined): void;
      theme: { fg(color: string, text: string): string; strikethrough(text: string): string };
    };
  }
  export interface ToolEvent {
    toolName: string;
    input: Record<string, unknown>;
    isError?: boolean;
    content: unknown[];
  }
  export interface Events {
    context: { messages: Message[] };
    before_agent_start: Record<string, unknown>;
    input: { source: string; text: string };
    tool_call: ToolEvent;
    tool_result: ToolEvent;
    turn_end: { message: Message };
    agent_end: { messages: Message[] };
    session_start: Record<string, unknown>;
  }
  export interface ExtensionAPI {
    registerFlag(
      name: string,
      options: { type: string; description: string; default?: boolean },
    ): void;
    getFlag(name: string): unknown;
    getActiveTools(): string[];
    setActiveTools(tools: string[]): void;
    registerCommand(
      name: string,
      command: { description: string; handler(args: string, ctx: ExtensionContext): Promise<void> },
    ): void;
    registerShortcut(
      key: string,
      shortcut: { description: string; handler(ctx: ExtensionContext): Promise<void> },
    ): void;
    appendEntry(name: string, data: PlanState): void;
    sendMessage(
      message: { customType: string; content: string; display: boolean },
      options?: { triggerTurn?: boolean; deliverAs?: string },
    ): void;
    sendUserMessage(text: string, options?: { deliverAs?: string }): void;
    on<K extends keyof Events>(
      name: K,
      handler: (event: Events[K], ctx: ExtensionContext) => unknown | Promise<unknown>,
    ): void;
  }
}
