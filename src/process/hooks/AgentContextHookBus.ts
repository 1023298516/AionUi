/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MemoryRecallHookPayload {
  conversationId: string;
  assistantId: string;
  workspaceId: string;
  input?: string;
  enabled?: boolean;
  memoryContext?: string;
}

export interface BeforeSendToAgentHookPayload {
  conversationId: string;
  assistantId: string;
  workspaceId: string;
  agentInput: string;
}

export interface AfterTurnCompleteHookPayload {
  conversationId: string;
  assistantId: string;
  workspaceId: string;
  userInput: string;
  assistantResponse?: string;
}

export interface AgentContextHookMap {
  beforeMemoryRecall: MemoryRecallHookPayload;
  afterMemoryRecall: Required<Pick<MemoryRecallHookPayload, 'conversationId' | 'assistantId' | 'workspaceId'>> & {
    memoryContext: string;
  };
  beforeSendToAgent: BeforeSendToAgentHookPayload;
  afterTurnComplete: AfterTurnCompleteHookPayload;
}

type HookName = keyof AgentContextHookMap;
type HookHandler<T extends HookName> = (payload: AgentContextHookMap[T]) => AgentContextHookMap[T] | Promise<AgentContextHookMap[T]>;

export class AgentContextHookBus {
  private readonly handlers: {
    [K in HookName]?: Array<HookHandler<K>>;
  } = {};

  register<T extends HookName>(name: T, handler: HookHandler<T>): () => void {
    const handlers = (this.handlers[name] ??= []) as Array<HookHandler<T>>;
    handlers.push(handler);

    return () => {
      const current = (this.handlers[name] ?? []) as Array<HookHandler<T>>;
      this.handlers[name] = current.filter((item) => item !== handler) as typeof this.handlers[T];
    };
  }

  async runBeforeMemoryRecall(payload: AgentContextHookMap['beforeMemoryRecall']) {
    return this.run('beforeMemoryRecall', payload);
  }

  async runAfterMemoryRecall(payload: AgentContextHookMap['afterMemoryRecall']) {
    return this.run('afterMemoryRecall', payload);
  }

  async runBeforeSendToAgent(payload: AgentContextHookMap['beforeSendToAgent']) {
    return this.run('beforeSendToAgent', payload);
  }

  async runAfterTurnComplete(payload: AgentContextHookMap['afterTurnComplete']) {
    return this.run('afterTurnComplete', payload);
  }

  private async run<T extends HookName>(name: T, payload: AgentContextHookMap[T]): Promise<AgentContextHookMap[T]> {
    let current = payload;
    const handlers = (this.handlers[name] ?? []) as Array<HookHandler<T>>;
    for (const handler of handlers) {
      current = await handler(current);
    }
    return current;
  }
}

let singleton: AgentContextHookBus | null = null;

export function getAgentContextHookBus(): AgentContextHookBus {
  if (!singleton) {
    singleton = new AgentContextHookBus();
  }
  return singleton;
}
