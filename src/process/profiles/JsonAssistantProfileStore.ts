/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import type { AssistantProfileStoreData } from '@/common/types/assistantProfile';

const CURRENT_PROFILE_STORE_VERSION = 1;

function createEmptyStore(): AssistantProfileStoreData {
  return {
    version: CURRENT_PROFILE_STORE_VERSION,
    profiles: [],
  };
}

export class JsonAssistantProfileStore {
  private cache: AssistantProfileStoreData | null = null;

  constructor(private readonly filePath: string) {}

  getFilePath(): string {
    return this.filePath;
  }

  async read(): Promise<AssistantProfileStoreData> {
    if (this.cache) return this.cache;

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as AssistantProfileStoreData;
      this.cache = {
        version: parsed.version || CURRENT_PROFILE_STORE_VERSION,
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      };
      return this.cache;
    } catch {
      this.cache = createEmptyStore();
      return this.cache;
    }
  }

  async write(data: AssistantProfileStoreData): Promise<void> {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.cache = {
      version: data.version || CURRENT_PROFILE_STORE_VERSION,
      profiles: data.profiles,
    };
    fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
  }
}
