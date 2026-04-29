import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantProfile } from '@/common/types/assistantProfile';
import type { FileCheckpoint } from '@/process/checkpoints';
import type { CreateSelfEvolutionCandidateParams, SelfEvolutionCandidate } from '@/common/types/selfEvolution';
import type { MemoryScope } from '@/common/types/memory';

type Handler = (args: any) => unknown | Promise<unknown>;

const { handlers, profileService, checkpointService, evolutionService, memoryService, skillManifestService } = vi.hoisted(() => {
  const handlers = {} as Record<string, Handler>;
  const now = Date.now();
  const profiles = new Map<string, AssistantProfile>();
  const candidates: SelfEvolutionCandidate[] = [];
  const checkpoints: FileCheckpoint[] = [];
  const scopes: MemoryScope[] = [
    {
      id: 'memory-local-global-custom-writer',
      userId: 'local',
      workspaceId: 'global',
      assistantId: 'custom-writer',
      assistantName: 'Writer',
      backend: 'local-json',
      entryCount: 2,
      createdAt: now,
      updatedAt: now,
    },
  ];

  function createProfile(assistantId: string, assistantName?: string): AssistantProfile {
    return {
      assistantId,
      assistantName,
      memory: { enabled: true, maxPromptEntries: 20 },
      context: {
        contextFilesEnabled: false,
        referencesEnabled: false,
        allowedContextFiles: ['.aionui.md', 'AGENTS.md', 'SOUL.md', 'memory.rules.md'],
      },
      evolution: { enabled: false, requireApproval: true },
      skills: { manifestProtectionEnabled: true, skillIds: [] },
      createdAt: now,
      updatedAt: now,
    };
  }

  const profileService = {
    ensureProfile: vi.fn(async ({ assistantId, assistantName }: { assistantId: string; assistantName?: string }) => {
      const existing = profiles.get(assistantId);
      if (existing) return existing;
      const profile = createProfile(assistantId, assistantName);
      profiles.set(assistantId, profile);
      return profile;
    }),
    updateProfile: vi.fn(async (assistantId: string, updates: Partial<AssistantProfile>) => {
      const existing = profiles.get(assistantId) ?? createProfile(assistantId);
      const updated: AssistantProfile = {
        ...existing,
        assistantName: updates.assistantName ?? existing.assistantName,
        memory: updates.memory ? { ...existing.memory, ...updates.memory } : existing.memory,
        context: updates.context ? { ...existing.context, ...updates.context } : existing.context,
        evolution: updates.evolution ? { ...existing.evolution, ...updates.evolution } : existing.evolution,
        skills: updates.skills ? { ...existing.skills, ...updates.skills } : existing.skills,
        updatedAt: now + 1,
      };
      profiles.set(assistantId, updated);
      return updated;
    }),
    __reset: () => profiles.clear(),
  };

  const checkpointService = {
    listCheckpoints: vi.fn(async () => checkpoints),
    restoreCheckpoint: vi.fn(async (_id: string) => undefined),
    __seed: (checkpoint: FileCheckpoint) => checkpoints.push(checkpoint),
    __reset: () => {
      checkpoints.length = 0;
    },
  };

  const evolutionService = {
    listCandidates: vi.fn(async (assistantId?: string) =>
      candidates.filter((candidate) => !assistantId || candidate.assistantId === assistantId)
    ),
    approveCandidate: vi.fn(async (id: string) => {
      const candidate = candidates.find((item) => item.id === id);
      if (!candidate) throw new Error(`Candidate not found: ${id}`);
      candidate.status = 'approved';
      return candidate;
    }),
    applyCandidate: vi.fn(async (_id: string) => ({ applied: true as const })),
    createCandidate: vi.fn(async (params: CreateSelfEvolutionCandidateParams) => {
      const candidate: SelfEvolutionCandidate = {
        id: `candidate-${candidates.length + 1}`,
        assistantId: params.assistantId,
        type: params.type,
        title: params.title,
        content: params.content,
        targetPath: params.targetPath,
        status: 'candidate',
        active: false,
        createdAt: now,
        updatedAt: now,
      };
      candidates.push(candidate);
      return candidate;
    }),
    rejectCandidate: vi.fn(async (id: string) => {
      const candidate = candidates.find((item) => item.id === id);
      if (!candidate) throw new Error(`Candidate not found: ${id}`);
      candidate.status = 'rejected';
      return candidate;
    }),
    __reset: () => {
      candidates.length = 0;
    },
  };

  const memoryService = {
    ensureScope: vi.fn(async ({ assistantId, assistantName }: { assistantId: string; assistantName?: string }) => {
      const existing = scopes.find(
        (scope) => scope.userId === 'local' && scope.workspaceId === 'global' && scope.assistantId === assistantId
      );
      if (existing) return existing;
      const scope: MemoryScope = {
        id: `memory-local-global-${assistantId}`,
        userId: 'local',
        workspaceId: 'global',
        assistantId,
        assistantName,
        backend: 'local-json',
        entryCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      scopes.push(scope);
      return scope;
    }),
    listScopes: vi.fn(async () => scopes),
    buildPromptContext: vi.fn(async (scopeId: string, limit: number) =>
      scopeId === 'memory-local-global-custom-writer' ? `memory preview limit ${limit}` : ''
    ),
    __reset: () => {
      scopes.length = 0;
      scopes.push({
        id: 'memory-local-global-custom-writer',
        userId: 'local',
        workspaceId: 'global',
        assistantId: 'custom-writer',
        assistantName: 'Writer',
        backend: 'local-json',
        entryCount: 2,
        createdAt: now,
        updatedAt: now,
      });
    },
  };

  const skillManifestService = {
    listFileStatuses: vi.fn(async () => [
      {
        state: 'user-modified' as const,
        filePath: 'D:/AionUi/skills/writer/SKILL.md',
        owner: 'custom-writer',
        originHash: 'origin',
        currentHash: 'current',
      },
    ]),
  };

  return { handlers, profileService, checkpointService, evolutionService, memoryService, skillManifestService };
});

function makeChannel(name: string) {
  return {
    provider: vi.fn((handler: Handler) => {
      handlers[name] = handler;
    }),
    invoke: vi.fn(),
  };
}

vi.mock('@/common', () => ({
  ipcBridge: {
    assistantAdvanced: {
      ensureProfile: makeChannel('ensureProfile'),
      getOverview: makeChannel('getOverview'),
      updateProfile: makeChannel('updateProfile'),
      approveCandidate: makeChannel('approveCandidate'),
      applyCandidate: makeChannel('applyCandidate'),
      createCandidate: makeChannel('createCandidate'),
      ensureMemoryScope: makeChannel('ensureMemoryScope'),
      getMemoryPreview: makeChannel('getMemoryPreview'),
      rejectCandidate: makeChannel('rejectCandidate'),
      restoreCheckpoint: makeChannel('restoreCheckpoint'),
    },
  },
}));

vi.mock('@process/profiles', () => ({
  getAssistantProfileService: () => profileService,
}));

vi.mock('@process/checkpoints', () => ({
  getCheckpointService: () => checkpointService,
}));

vi.mock('@process/evolution', () => ({
  getSelfEvolutionService: () => evolutionService,
}));

vi.mock('@process/memory', () => ({
  getMemoryService: () => memoryService,
}));

vi.mock('@process/skills', () => ({
  getSkillManifestService: () => skillManifestService,
}));

import { initAssistantAdvancedBridge } from '@/process/bridge/assistantAdvancedBridge';

function getHandler<T extends Handler>(name: string): T {
  const handler = handlers[name];
  expect(handler).toBeTypeOf('function');
  return handler as T;
}

describe('assistantAdvancedBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) delete handlers[key];
    profileService.__reset();
    evolutionService.__reset();
    checkpointService.__reset();
    memoryService.__reset();
    initAssistantAdvancedBridge();
  });

  it('ensures a conservative default profile for an assistant', async () => {
    const ensureProfile = getHandler<(args: { assistantId: string; assistantName?: string }) => Promise<AssistantProfile>>(
      'ensureProfile'
    );

    const profile = await ensureProfile({ assistantId: 'builtin-word', assistantName: 'Word' });

    expect(profile.memory.enabled).toBe(true);
    expect(profile.memory.maxPromptEntries).toBe(20);
    expect(profile.context.contextFilesEnabled).toBe(false);
    expect(profile.context.referencesEnabled).toBe(false);
    expect(profile.evolution.enabled).toBe(false);
    expect(profile.evolution.requireApproval).toBe(true);
    expect(profile.skills.manifestProtectionEnabled).toBe(true);
  });

  it('updates profile policy sections without replacing omitted sections', async () => {
    const ensureProfile = getHandler<(args: { assistantId: string }) => Promise<AssistantProfile>>('ensureProfile');
    const updateProfile = getHandler<
      (args: {
        assistantId: string;
        updates: {
          memory?: { enabled?: boolean; maxPromptEntries?: number };
          context?: { referencesEnabled?: boolean };
        };
      }) => Promise<AssistantProfile>
    >('updateProfile');

    await ensureProfile({ assistantId: 'custom-writer' });
    const updated = await updateProfile({
      assistantId: 'custom-writer',
      updates: {
        memory: { enabled: false, maxPromptEntries: 8 },
        context: { referencesEnabled: true },
      },
    });

    expect(updated.memory).toEqual({ enabled: false, maxPromptEntries: 8 });
    expect(updated.context.contextFilesEnabled).toBe(false);
    expect(updated.context.referencesEnabled).toBe(true);
  });

  it('lists inspectable memory, skill, context, and checkpoint details for the advanced settings panel', async () => {
    const getOverview = getHandler<
      (args: { assistantId: string; assistantName?: string }) => Promise<{
        profile: AssistantProfile;
        candidates: SelfEvolutionCandidate[];
        checkpoints: Array<FileCheckpoint & { contentLength: number }>;
        memoryPreview: { scopeId: string; scopeCount: number; entryCount: number; memoryContext: string };
        contextFileStatuses: Array<{ fileName: string; valid: boolean; reason?: string }>;
        skillFiles: Array<{ state: string; filePath: string; owner?: string }>;
      }>
    >('getOverview');
    checkpointService.__seed({
      id: 'checkpoint-1',
      namespace: 'assistant-profile',
      reason: 'before assistant profile update',
      targetPath: 'D:/AionUi/profile.json',
      existed: true,
      content: '{"ok":true}',
      createdAt: 42,
    });

    const result = await getOverview({ assistantId: 'custom-writer', assistantName: 'Writer' });

    expect(result.profile.assistantId).toBe('custom-writer');
    expect(result.candidates).toEqual([]);
    expect(result.memoryPreview).toMatchObject({
      scopeId: 'memory-local-global-custom-writer',
      scopeCount: 1,
      entryCount: 2,
      memoryContext: 'memory preview limit 20',
    });
    expect(result.contextFileStatuses).toContainEqual({ fileName: 'AGENTS.md', valid: true });
    expect(result.skillFiles).toEqual([
      expect.objectContaining({
        state: 'user-modified',
        filePath: 'D:/AionUi/skills/writer/SKILL.md',
        owner: 'custom-writer',
      }),
    ]);
    expect(result.checkpoints).toEqual([
      expect.objectContaining({
        id: 'checkpoint-1',
        namespace: 'assistant-profile',
        contentLength: 11,
      }),
    ]);
  });

  it('ensures a default global memory scope on explicit user action', async () => {
    const ensureMemoryScope = getHandler<
      (args: { assistantId: string; assistantName?: string }) => Promise<{
        scopeId: string;
        scopeCount: number;
        entryCount: number;
        memoryContext: string;
      }>
    >('ensureMemoryScope');

    const preview = await ensureMemoryScope({ assistantId: 'new-assistant', assistantName: 'New Assistant' });

    expect(preview).toMatchObject({
      scopeId: 'memory-local-global-new-assistant',
      scopeCount: 1,
      entryCount: 0,
      memoryContext: '',
    });
    expect(memoryService.ensureScope).toHaveBeenCalledWith({
      userId: 'local',
      workspaceId: 'global',
      assistantId: 'new-assistant',
      assistantName: 'New Assistant',
    });
  });

  it('creates self-evolution candidates through the advanced settings bridge', async () => {
    const createCandidate = getHandler<
      (args: CreateSelfEvolutionCandidateParams) => Promise<SelfEvolutionCandidate>
    >('createCandidate');

    const candidate = await createCandidate({
      assistantId: 'custom-writer',
      type: 'profile-policy',
      title: 'Prefer concise answers',
      content: 'Keep replies short unless the user asks for depth.',
    });

    expect(candidate).toMatchObject({
      assistantId: 'custom-writer',
      type: 'profile-policy',
      title: 'Prefer concise answers',
      status: 'candidate',
    });
    expect(evolutionService.createCandidate).toHaveBeenCalledWith({
      assistantId: 'custom-writer',
      type: 'profile-policy',
      title: 'Prefer concise answers',
      content: 'Keep replies short unless the user asks for depth.',
    });
  });
});
