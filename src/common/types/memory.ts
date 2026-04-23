/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type MemoryBackend = 'local-json' | 'cognee';

export type MemoryEntryKind = 'fact' | 'preference' | 'note';

export interface MemoryScopeIdentity {
  userId: string;
  workspaceId: string;
  assistantId: string;
  teamId?: string;
}

export interface EnsureMemoryScopeParams extends MemoryScopeIdentity {
  assistantName?: string;
  backend?: MemoryBackend;
}

export interface MemoryScope extends MemoryScopeIdentity {
  id: string;
  assistantName?: string;
  backend: MemoryBackend;
  entryCount: number;
  orphaned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryEntry {
  id: string;
  scopeId: string;
  kind: MemoryEntryKind;
  content: string;
  tags: string[];
  source?: string;
  confidence?: number;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertMemoryEntryParams {
  id?: string;
  scopeId: string;
  kind: MemoryEntryKind;
  content: string;
  tags?: string[];
  source?: string;
  confidence?: number;
}

export interface MemoryStoreData {
  version: number;
  scopes: MemoryScope[];
  entries: MemoryEntry[];
}

export interface MemoryReportSummary {
  scopeCount: number;
  entryCount: number;
}
