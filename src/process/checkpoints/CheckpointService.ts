/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDataPath } from '@process/utils';

export interface CreateCheckpointParams {
  targetPath: string;
  namespace: string;
  reason: string;
}

export interface FileCheckpoint {
  id: string;
  namespace: string;
  reason: string;
  targetPath: string;
  existed: boolean;
  content?: string;
  createdAt: number;
}

export class CheckpointService {
  constructor(private readonly checkpointDir: string) {}

  async createCheckpoint(params: CreateCheckpointParams): Promise<FileCheckpoint> {
    fs.mkdirSync(this.checkpointDir, { recursive: true });
    const checkpoint: FileCheckpoint = {
      id: crypto.randomUUID(),
      namespace: params.namespace,
      reason: params.reason,
      targetPath: path.resolve(params.targetPath),
      existed: fs.existsSync(params.targetPath),
      content: fs.existsSync(params.targetPath) ? fs.readFileSync(params.targetPath, 'utf-8') : undefined,
      createdAt: Date.now(),
    };
    fs.writeFileSync(this.getCheckpointPath(checkpoint.id), JSON.stringify(checkpoint, null, 2), 'utf-8');
    return checkpoint;
  }

  async listCheckpoints(): Promise<FileCheckpoint[]> {
    try {
      return fs
        .readdirSync(this.checkpointDir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(fs.readFileSync(path.join(this.checkpointDir, file), 'utf-8')) as FileCheckpoint)
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  async restoreCheckpoint(id: string): Promise<void> {
    const checkpoint = JSON.parse(fs.readFileSync(this.getCheckpointPath(id), 'utf-8')) as FileCheckpoint;
    if (!checkpoint.existed) {
      if (fs.existsSync(checkpoint.targetPath)) {
        fs.unlinkSync(checkpoint.targetPath);
      }
      return;
    }

    fs.mkdirSync(path.dirname(checkpoint.targetPath), { recursive: true });
    fs.writeFileSync(checkpoint.targetPath, checkpoint.content ?? '', 'utf-8');
  }

  private getCheckpointPath(id: string): string {
    return path.join(this.checkpointDir, `${id}.json`);
  }
}

let singleton: CheckpointService | null = null;

export function getCheckpointService(): CheckpointService {
  if (!singleton) {
    singleton = new CheckpointService(path.join(getDataPath(), 'checkpoints'));
  }
  return singleton;
}
