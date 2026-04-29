/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDataPath } from '@process/utils';
import type { CheckpointService } from '@process/checkpoints';
import type {
  CreateSelfEvolutionCandidateParams,
  SelfEvolutionCandidate,
  SelfEvolutionStoreData,
} from '@/common/types/selfEvolution';

const CURRENT_EVOLUTION_STORE_VERSION = 1;

function createEmptyStore(): SelfEvolutionStoreData {
  return {
    version: CURRENT_EVOLUTION_STORE_VERSION,
    candidates: [],
  };
}

function isCoreSourcePath(targetPath: string): boolean {
  const parts = path.resolve(targetPath).split(path.sep).map((part) => part.toLowerCase());
  return parts.includes('src');
}

export class SelfEvolutionService {
  constructor(
    private readonly storePath: string,
    private readonly checkpointService?: CheckpointService
  ) {}

  async createCandidate(params: CreateSelfEvolutionCandidateParams): Promise<SelfEvolutionCandidate> {
    const now = Date.now();
    const candidate: SelfEvolutionCandidate = {
      id: crypto.randomUUID(),
      assistantId: params.assistantId,
      type: params.type,
      title: params.title,
      content: params.content,
      targetPath: params.targetPath ? path.resolve(params.targetPath) : undefined,
      status: 'candidate',
      active: false,
      createdAt: now,
      updatedAt: now,
    };
    const data = await this.read();
    data.candidates.push(candidate);
    await this.write(data);
    return candidate;
  }

  async approveCandidate(id: string): Promise<SelfEvolutionCandidate> {
    return this.updateCandidate(id, (candidate) => ({
      ...candidate,
      status: 'approved',
      updatedAt: Date.now(),
    }));
  }

  async rejectCandidate(id: string): Promise<SelfEvolutionCandidate> {
    return this.updateCandidate(id, (candidate) => ({
      ...candidate,
      status: 'rejected',
      active: false,
      updatedAt: Date.now(),
    }));
  }

  async applyCandidate(id: string): Promise<{ applied: true } | { applied: false; reason: string }> {
    const candidate = await this.getCandidate(id);
    if (!candidate) {
      return { applied: false, reason: 'not-found' };
    }
    if (candidate.status !== 'approved') {
      return { applied: false, reason: 'not-approved' };
    }
    if (!candidate.targetPath) {
      await this.markApplied(id);
      return { applied: true };
    }
    if (isCoreSourcePath(candidate.targetPath)) {
      return { applied: false, reason: 'core-source-not-allowed' };
    }

    await this.checkpointService?.createCheckpoint({
      targetPath: candidate.targetPath,
      namespace: 'self-evolution',
      reason: `before applying candidate ${candidate.id}`,
    });
    fs.mkdirSync(path.dirname(candidate.targetPath), { recursive: true });
    fs.writeFileSync(candidate.targetPath, candidate.content, 'utf-8');
    await this.markApplied(id);
    return { applied: true };
  }

  async getCandidate(id: string): Promise<SelfEvolutionCandidate | undefined> {
    const data = await this.read();
    return data.candidates.find((candidate) => candidate.id === id);
  }

  async listCandidates(assistantId?: string): Promise<SelfEvolutionCandidate[]> {
    const data = await this.read();
    return data.candidates
      .filter((candidate) => !assistantId || candidate.assistantId === assistantId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private async markApplied(id: string): Promise<SelfEvolutionCandidate> {
    return this.updateCandidate(id, (candidate) => ({
      ...candidate,
      status: 'applied',
      active: true,
      updatedAt: Date.now(),
    }));
  }

  private async updateCandidate(
    id: string,
    update: (candidate: SelfEvolutionCandidate) => SelfEvolutionCandidate
  ): Promise<SelfEvolutionCandidate> {
    const data = await this.read();
    const existing = data.candidates.find((candidate) => candidate.id === id);
    if (!existing) {
      throw new Error(`Self-evolution candidate not found: ${id}`);
    }
    const updated = update(existing);
    data.candidates = data.candidates.map((candidate) => (candidate.id === id ? updated : candidate));
    await this.write(data);
    return updated;
  }

  private async read(): Promise<SelfEvolutionStoreData> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as SelfEvolutionStoreData;
      return {
        version: parsed.version || CURRENT_EVOLUTION_STORE_VERSION,
        candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
      };
    } catch {
      return createEmptyStore();
    }
  }

  private async write(data: SelfEvolutionStoreData): Promise<void> {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

let singleton: SelfEvolutionService | null = null;

export function getSelfEvolutionService(): SelfEvolutionService {
  if (!singleton) {
    singleton = new SelfEvolutionService(path.join(getDataPath(), 'evolution', 'self-evolution.json'));
  }
  return singleton;
}
