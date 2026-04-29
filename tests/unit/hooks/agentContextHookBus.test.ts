import { describe, expect, it, vi } from 'vitest';
import { AgentContextHookBus } from '../../../src/process/hooks/AgentContextHookBus';

describe('AgentContextHookBus', () => {
  it('lets beforeMemoryRecall hooks disable memory recall', async () => {
    const bus = new AgentContextHookBus();
    bus.register('beforeMemoryRecall', async (payload) => ({
      ...payload,
      enabled: false,
    }));

    const result = await bus.runBeforeMemoryRecall({
      conversationId: 'conversation-1',
      assistantId: 'assistant-1',
      workspaceId: 'D:/work',
      input: 'hello',
      enabled: true,
    });

    expect(result.enabled).toBe(false);
  });

  it('runs afterMemoryRecall hooks in registration order', async () => {
    const bus = new AgentContextHookBus();
    bus.register('afterMemoryRecall', async (payload) => ({
      ...payload,
      memoryContext: `${payload.memoryContext}\n- hook one`,
    }));
    bus.register('afterMemoryRecall', async (payload) => ({
      ...payload,
      memoryContext: `${payload.memoryContext}\n- hook two`,
    }));

    const result = await bus.runAfterMemoryRecall({
      conversationId: 'conversation-1',
      assistantId: 'assistant-1',
      workspaceId: 'D:/work',
      memoryContext: '- base',
    });

    expect(result.memoryContext).toBe('- base\n- hook one\n- hook two');
  });

  it('can unsubscribe hooks', async () => {
    const bus = new AgentContextHookBus();
    const handler = vi.fn(async (payload) => ({ ...payload, agentInput: `${payload.agentInput}\nextra` }));
    const unsubscribe = bus.register('beforeSendToAgent', handler);
    unsubscribe();

    const result = await bus.runBeforeSendToAgent({
      conversationId: 'conversation-1',
      assistantId: 'assistant-1',
      workspaceId: 'D:/work',
      agentInput: 'hello',
    });

    expect(result.agentInput).toBe('hello');
    expect(handler).not.toHaveBeenCalled();
  });
});
