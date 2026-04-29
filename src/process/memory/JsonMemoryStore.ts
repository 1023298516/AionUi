/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import type { MemoryEntry, MemoryScope, MemoryStoreData } from '@/common/types/memory';

const CURRENT_MEMORY_STORE_VERSION = 1;

function createEmptyStore(): MemoryStoreData {
  return {
    version: CURRENT_MEMORY_STORE_VERSION,
    scopes: [],
    entries: [],
  };
}

export class JsonMemoryStore {
  private cache: MemoryStoreData | null = null;

  constructor(private readonly filePath: string) {}

  getFilePath(): string {
    return this.filePath;
  }

  async read(): Promise<MemoryStoreData> {
    return this.readSync();
  }

  async write(data: MemoryStoreData): Promise<void> {
    this.writeSync(data);
  }

  async listScopes(): Promise<MemoryScope[]> {
    return this.readSync().scopes;
  }

  async listEntries(scopeId: string): Promise<MemoryEntry[]> {
    return this.readSync().entries.filter((entry) => entry.scopeId === scopeId);
  }

  private readSync(): MemoryStoreData {
    if (this.cache) return this.cache;

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as MemoryStoreData;
      this.cache = {
        version: parsed.version || CURRENT_MEMORY_STORE_VERSION,
        scopes: Array.isArray(parsed.scopes) ? parsed.scopes : [],
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      };
      return this.cache;
    } catch {
      this.cache = createEmptyStore();
      return this.cache;
    }
  }

  private writeSync(data: MemoryStoreData): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.cache = {
      version: data.version || CURRENT_MEMORY_STORE_VERSION,
      scopes: data.scopes,
      entries: data.entries,
    };
    fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
  }
}
