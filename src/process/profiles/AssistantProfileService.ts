/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import type {
  AssistantProfile,
  AssistantProfileContextPolicy,
  AssistantProfileEvolutionPolicy,
  AssistantProfileMemoryPolicy,
  AssistantProfileSkillPolicy,
  EnsureAssistantProfileParams,
  UpdateAssistantProfileParams,
} from '@/common/types/assistantProfile';
import { getDataPath } from '@process/utils';
import { JsonAssistantProfileStore } from './JsonAssistantProfileStore';
import type { CheckpointService } from '@process/checkpoints';

const DEFAULT_MEMORY_POLICY: AssistantProfileMemoryPolicy = {
  enabled: true,
  maxPromptEntries: 20,
};

const DEFAULT_CONTEXT_POLICY: AssistantProfileContextPolicy = {
  contextFilesEnabled: false,
  referencesEnabled: false,
  allowedContextFiles: ['.aionui.md', 'AGENTS.md', 'SOUL.md', 'memory.rules.md'],
};

const DEFAULT_EVOLUTION_POLICY: AssistantProfileEvolutionPolicy = {
  enabled: false,
  requireApproval: true,
};

const DEFAULT_SKILL_POLICY: AssistantProfileSkillPolicy = {
  manifestProtectionEnabled: true,
  skillIds: [],
};

function createDefaultProfile(params: EnsureAssistantProfileParams, now: number): AssistantProfile {
  return {
    assistantId: params.assistantId,
    assistantName: params.assistantName,
    memory: { ...DEFAULT_MEMORY_POLICY },
    context: { ...DEFAULT_CONTEXT_POLICY },
    evolution: { ...DEFAULT_EVOLUTION_POLICY },
    skills: { ...DEFAULT_SKILL_POLICY },
    createdAt: now,
    updatedAt: now,
  };
}

function mergeProfile(
  existing: AssistantProfile,
  updates: UpdateAssistantProfileParams,
  now: number
): AssistantProfile {
  return {
    ...existing,
    assistantName: updates.assistantName ?? existing.assistantName,
    memory: updates.memory ? { ...existing.memory, ...updates.memory } : existing.memory,
    context: updates.context ? { ...existing.context, ...updates.context } : existing.context,
    evolution: updates.evolution ? { ...existing.evolution, ...updates.evolution } : existing.evolution,
    skills: updates.skills ? { ...existing.skills, ...updates.skills } : existing.skills,
    updatedAt: now,
  };
}

export class AssistantProfileService {
  constructor(
    private readonly store: JsonAssistantProfileStore,
    private readonly checkpointService?: CheckpointService
  ) {}

  private async checkpoint(reason: string): Promise<void> {
    await this.checkpointService?.createCheckpoint({
      targetPath: this.store.getFilePath(),
      namespace: 'assistant-profile',
      reason,
    });
  }

  async ensureProfile(params: EnsureAssistantProfileParams): Promise<AssistantProfile> {
    const now = Date.now();
    const data = await this.store.read();
    const existing = data.profiles.find((profile) => profile.assistantId === params.assistantId);

    if (existing) {
      const updated = mergeProfile(existing, { assistantName: params.assistantName }, now);
      data.profiles = data.profiles.map((profile) => (profile.assistantId === params.assistantId ? updated : profile));
      await this.store.write(data);
      return updated;
    }

    const profile = createDefaultProfile(params, now);
    data.profiles.push(profile);
    await this.store.write(data);
    return profile;
  }

  async getProfile(assistantId: string): Promise<AssistantProfile | undefined> {
    const data = await this.store.read();
    return data.profiles.find((profile) => profile.assistantId === assistantId);
  }

  async listProfiles(): Promise<AssistantProfile[]> {
    const data = await this.store.read();
    return [...data.profiles].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async updateProfile(assistantId: string, updates: UpdateAssistantProfileParams): Promise<AssistantProfile> {
    const existing = (await this.getProfile(assistantId)) ?? (await this.ensureProfile({ assistantId }));
    const updated = mergeProfile(existing, updates, Date.now());
    const data = await this.store.read();
    await this.checkpoint('before assistant profile update');
    data.profiles = data.profiles.map((profile) => (profile.assistantId === assistantId ? updated : profile));
    await this.store.write(data);
    return updated;
  }

  async getMemoryPolicy(assistantId: string): Promise<AssistantProfileMemoryPolicy> {
    const profile = (await this.getProfile(assistantId)) ?? (await this.ensureProfile({ assistantId }));
    return profile.memory;
  }

  async getContextPolicy(assistantId: string): Promise<AssistantProfileContextPolicy> {
    const profile = (await this.getProfile(assistantId)) ?? (await this.ensureProfile({ assistantId }));
    return profile.context;
  }
}

let singleton: AssistantProfileService | null = null;

export function getAssistantProfileService(): AssistantProfileService {
  if (!singleton) {
    singleton = new AssistantProfileService(
      new JsonAssistantProfileStore(path.join(getDataPath(), 'profiles', 'assistant-profiles.json'))
    );
  }
  return singleton;
}
