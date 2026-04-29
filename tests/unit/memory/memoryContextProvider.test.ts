import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { TChatConversation } from '../../../src/common/config/storage';
import {
  buildMemoryAugmentedInput,
  ensureConversationMemoryScope,
  resolveConversationMemoryScopeParams,
} from '../../../src/process/memory/MemoryContextProvider';
import { AgentContextHookBus } from '../../../src/process/hooks/AgentContextHookBus';

function makeConversation(extra: Record<string, unknown> = {}): TChatConversation {
  return {
    id: 'conversation-1',
    type: 'gemini',
    name: 'Research Assistant',
    extra,
  } as unknown as TChatConversation;
}

function makeMemoryService(context = '[AionUi Assistant Memory]\n- (fact) Use project rules.') {
  return {
    ensureScope: vi.fn(async (params) => ({
      ...params,
      id: 'scope-1',
      backend: 'local-json',
      entryCount: 1,
      createdAt: 1,
      updatedAt: 2,
    })),
    buildPromptContext: vi.fn(async () => context),
  };
}

describe('MemoryContextProvider', () => {
  it('resolves assistant workspace scope identity from conversation metadata', () => {
    const params = resolveConversationMemoryScopeParams(
      makeConversation({
        workspace: 'D:/work/project',
        teamId: 'team-1',
        presetAssistantId: 'assistant-1',
        agentName: 'Planner',
      }),
      'D:/fallback'
    );

    expect(params).toEqual({
      userId: 'local',
      workspaceId: 'D:/work/project',
      teamId: 'team-1',
      assistantId: 'assistant-1',
      assistantName: 'Planner',
    });
  });

  it('returns null when conversation has no assistant identity', () => {
    expect(resolveConversationMemoryScopeParams(makeConversation({ workspace: 'D:/work' }))).toBeNull();
  });

  it('ensures a scope through the provided memory service', async () => {
    const memoryService = makeMemoryService();

    const scopeId = await ensureConversationMemoryScope(
      makeConversation({ customAgentId: 'custom-1' }),
      'D:/fallback',
      memoryService
    );

    expect(scopeId).toBe('scope-1');
    expect(memoryService.ensureScope).toHaveBeenCalledWith({
      userId: 'local',
      workspaceId: 'D:/fallback',
      assistantId: 'custom-1',
      assistantName: 'Research Assistant',
    });
  });

  it('builds agent input by prepending scoped memory context', async () => {
    const memoryService = makeMemoryService();
    const conversationService = {
      getConversation: vi.fn(async () =>
        makeConversation({
          workspace: 'D:/work/project',
          customAgentId: 'custom-1',
        })
      ),
    };

    const result = await buildMemoryAugmentedInput({
      conversationService,
      conversationId: 'conversation-1',
      workspaceFallback: 'D:/fallback',
      input: 'Write the report.',
      memoryService,
    });

    expect(result).toEqual({
      memoryContext: '[AionUi Assistant Memory]\n- (fact) Use project rules.',
      agentInput: '[AionUi Assistant Memory]\n- (fact) Use project rules.\n\n[User Request]\nWrite the report.',
    });
    expect(memoryService.buildPromptContext).toHaveBeenCalledWith('scope-1', 20);
  });

  it('leaves input unchanged and skips lookup for silent or hidden messages', async () => {
    const memoryService = makeMemoryService();
    const conversationService = {
      getConversation: vi.fn(async () => makeConversation({ customAgentId: 'custom-1' })),
    };

    const result = await buildMemoryAugmentedInput({
      conversationService,
      conversationId: 'conversation-1',
      workspaceFallback: 'D:/fallback',
      input: 'Internal ping',
      silent: true,
      memoryService,
    });

    expect(result).toEqual({ memoryContext: '', agentInput: 'Internal ping' });
    expect(conversationService.getConversation).not.toHaveBeenCalled();
    expect(memoryService.ensureScope).not.toHaveBeenCalled();
    expect(memoryService.buildPromptContext).not.toHaveBeenCalled();
  });

  it('leaves input unchanged when conversation has no memory scope identity', async () => {
    const memoryService = makeMemoryService();
    const conversationService = {
      getConversation: vi.fn(async () => makeConversation({ workspace: 'D:/work/project' })),
    };

    const result = await buildMemoryAugmentedInput({
      conversationService,
      conversationId: 'conversation-1',
      workspaceFallback: 'D:/fallback',
      input: 'Regular request',
      memoryService,
    });

    expect(result).toEqual({ memoryContext: '', agentInput: 'Regular request' });
    expect(memoryService.ensureScope).not.toHaveBeenCalled();
    expect(memoryService.buildPromptContext).not.toHaveBeenCalled();
  });

  it('uses assistant profile policy to skip memory recall', async () => {
    const memoryService = makeMemoryService();
    const profileService = {
      getMemoryPolicy: vi.fn(async () => ({ enabled: false, maxPromptEntries: 20 })),
    };
    const conversationService = {
      getConversation: vi.fn(async () =>
        makeConversation({
          workspace: 'D:/work/project',
          customAgentId: 'custom-1',
        })
      ),
    };

    const result = await buildMemoryAugmentedInput({
      conversationService,
      conversationId: 'conversation-1',
      workspaceFallback: 'D:/fallback',
      input: 'Write the report.',
      memoryService,
      profileService,
    });

    expect(result).toEqual({ memoryContext: '', agentInput: 'Write the report.' });
    expect(profileService.getMemoryPolicy).toHaveBeenCalledWith('custom-1');
    expect(memoryService.ensureScope).not.toHaveBeenCalled();
    expect(memoryService.buildPromptContext).not.toHaveBeenCalled();
  });

  it('runs context hooks around memory recall and final agent input', async () => {
    const memoryService = makeMemoryService();
    const hookBus = new AgentContextHookBus();
    hookBus.register('afterMemoryRecall', async (payload) => ({
      ...payload,
      memoryContext: `${payload.memoryContext}\n- (note) Hook context.`,
    }));
    hookBus.register('beforeSendToAgent', async (payload) => ({
      ...payload,
      agentInput: `${payload.agentInput}\n\n[Hook Footer]\nUse verified context only.`,
    }));
    const conversationService = {
      getConversation: vi.fn(async () =>
        makeConversation({
          workspace: 'D:/work/project',
          customAgentId: 'custom-1',
        })
      ),
    };

    const result = await buildMemoryAugmentedInput({
      conversationService,
      conversationId: 'conversation-1',
      workspaceFallback: 'D:/fallback',
      input: 'Write the report.',
      memoryService,
      hookBus,
    });

    expect(result.agentInput).toContain('- (note) Hook context.');
    expect(result.agentInput).toContain('[Hook Footer]');
  });

  it('adds enabled workspace context files and explicit references to agent input', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-context-integration-'));
    fs.writeFileSync(path.join(workspace, '.aionui.md'), 'Workspace rule: use local assets.', 'utf-8');
    fs.writeFileSync(path.join(workspace, 'brief.md'), 'Brief: build a compact demo.', 'utf-8');
    const memoryService = makeMemoryService('');
    const profileService = {
      getMemoryPolicy: vi.fn(async () => ({ enabled: true, maxPromptEntries: 20 })),
      getContextPolicy: vi.fn(async () => ({
        contextFilesEnabled: true,
        referencesEnabled: true,
        allowedContextFiles: ['.aionui.md'],
      })),
    };
    const conversationService = {
      getConversation: vi.fn(async () =>
        makeConversation({
          workspace,
          customAgentId: 'custom-1',
        })
      ),
    };

    const result = await buildMemoryAugmentedInput({
      conversationService,
      conversationId: 'conversation-1',
      workspaceFallback: workspace,
      input: 'Use @file:brief.md',
      memoryService,
      profileService,
    });

    expect(result.agentInput).toContain('[AionUi Context]');
    expect(result.agentInput).toContain('Workspace rule: use local assets.');
    expect(result.agentInput).toContain('Brief: build a compact demo.');
    expect(profileService.getContextPolicy).toHaveBeenCalledWith('custom-1');
  });
});
