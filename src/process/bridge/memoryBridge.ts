/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { getMemoryService } from '@process/memory';

export function initMemoryBridge(): void {
  const service = getMemoryService();

  ipcBridge.memory.ensureScope.provider((params) => service.ensureScope(params));
  ipcBridge.memory.listScopes.provider(() => service.listScopes());
  ipcBridge.memory.listEntries.provider(({ scopeId }) => service.listEntries(scopeId));
  ipcBridge.memory.upsertEntry.provider((params) => service.upsertEntry(params));
  ipcBridge.memory.deleteEntry.provider(({ scopeId, entryId }) => service.deleteEntry(scopeId, entryId));
  ipcBridge.memory.clearScope.provider(({ scopeId }) => service.clearScope(scopeId));
  ipcBridge.memory.deleteScope.provider(({ scopeId }) => service.deleteScope(scopeId));
  ipcBridge.memory.markAssistantDeleted.provider(({ assistantId }) => service.markAssistantDeleted(assistantId));
  ipcBridge.memory.summary.provider(() => service.summary());
}
