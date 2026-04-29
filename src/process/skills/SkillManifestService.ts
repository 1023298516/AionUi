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

export type SkillManifestState = 'unchanged' | 'user-modified' | 'missing' | 'untracked';

export interface SkillManifestEntry {
  filePath: string;
  owner: string;
  originHash: string;
  updatedAt: number;
}

export interface SkillManifestData {
  version: number;
  entries: SkillManifestEntry[];
}

export interface TrackSkillFileParams {
  filePath: string;
  owner: string;
}

export interface ApplySkillUpdateParams extends TrackSkillFileParams {
  content: string;
}

export interface SkillFileStatus {
  state: SkillManifestState;
  filePath: string;
  owner?: string;
  originHash?: string;
  currentHash?: string;
}

const CURRENT_SKILL_MANIFEST_VERSION = 1;

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function createEmptyManifest(): SkillManifestData {
  return {
    version: CURRENT_SKILL_MANIFEST_VERSION,
    entries: [],
  };
}

export class SkillManifestService {
  constructor(
    private readonly manifestPath: string,
    private readonly checkpointService?: CheckpointService
  ) {}

  async trackFile({ filePath, owner }: TrackSkillFileParams): Promise<SkillManifestEntry> {
    const resolvedPath = path.resolve(filePath);
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const entry: SkillManifestEntry = {
      filePath: resolvedPath,
      owner,
      originHash: hashContent(content),
      updatedAt: Date.now(),
    };
    const data = await this.read();
    data.entries = [...data.entries.filter((item) => item.filePath !== resolvedPath), entry];
    await this.write(data);
    return entry;
  }

  async getFileStatus(filePath: string): Promise<SkillFileStatus> {
    const resolvedPath = path.resolve(filePath);
    const data = await this.read();
    const entry = data.entries.find((item) => item.filePath === resolvedPath);
    if (!entry) {
      return { state: 'untracked', filePath: resolvedPath };
    }

    if (!fs.existsSync(resolvedPath)) {
      return {
        state: 'missing',
        filePath: resolvedPath,
        owner: entry.owner,
        originHash: entry.originHash,
      };
    }

    const currentHash = hashContent(fs.readFileSync(resolvedPath, 'utf-8'));
    return {
      state: currentHash === entry.originHash ? 'unchanged' : 'user-modified',
      filePath: resolvedPath,
      owner: entry.owner,
      originHash: entry.originHash,
      currentHash,
    };
  }

  async listFileStatuses(): Promise<SkillFileStatus[]> {
    const data = await this.read();
    return Promise.all(data.entries.map((entry) => this.getFileStatus(entry.filePath)));
  }

  async applyUpdate(params: ApplySkillUpdateParams): Promise<{ applied: true } | { applied: false; reason: string }> {
    const resolvedPath = path.resolve(params.filePath);
    const status = await this.getFileStatus(resolvedPath);
    if (status.state === 'user-modified') {
      return { applied: false, reason: 'user-modified' };
    }

    await this.checkpointService?.createCheckpoint({
      targetPath: resolvedPath,
      namespace: 'skill-manifest',
      reason: 'before skill update',
    });
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, params.content, 'utf-8');
    await this.trackFile({ filePath: resolvedPath, owner: params.owner });
    return { applied: true };
  }

  private async read(): Promise<SkillManifestData> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8')) as SkillManifestData;
      return {
        version: parsed.version || CURRENT_SKILL_MANIFEST_VERSION,
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      };
    } catch {
      return createEmptyManifest();
    }
  }

  private async write(data: SkillManifestData): Promise<void> {
    fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
    fs.writeFileSync(this.manifestPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

let singleton: SkillManifestService | null = null;

export function getSkillManifestService(): SkillManifestService {
  if (!singleton) {
    singleton = new SkillManifestService(path.join(getDataPath(), 'skills', 'skill-manifest.json'));
  }
  return singleton;
}
