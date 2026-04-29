/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  AssistantAdvancedCheckpointSummary,
  AssistantAdvancedContextFileStatus,
  AssistantAdvancedMemoryPreview,
} from '@/common/types/assistantAdvanced';
import type { AssistantProfile } from '@/common/types/assistantProfile';
import { getCheckpointService } from '@process/checkpoints';
import type { FileCheckpoint } from '@process/checkpoints';
import { getSelfEvolutionService } from '@process/evolution';
import { getMemoryService } from '@process/memory';
import { getAssistantProfileService } from '@process/profiles';
import { getSkillManifestService } from '@process/skills';

const DEFAULT_MEMORY_USER_ID = 'local';
const DEFAULT_MEMORY_WORKSPACE_ID = 'global';
const DEFAULT_MEMORY_ENTRY_LIMIT = 20;

function validateAllowedContextFile(fileName: string): AssistantAdvancedContextFileStatus {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return { fileName, valid: false, reason: 'empty' };
  }

  if (/^(?:[a-zA-Z]:[\\/]|[\\/])/.test(trimmed)) {
    return { fileName: trimmed, valid: false, reason: 'absolute' };
  }

  if (trimmed.includes('..')) {
    return { fileName: trimmed, valid: false, reason: 'parent-reference' };
  }

  if (/[\\/]/.test(trimmed)) {
    return { fileName: trimmed, valid: false, reason: 'nested' };
  }

  return { fileName: trimmed, valid: true };
}

function summarizeCheckpoint(checkpoint: FileCheckpoint): AssistantAdvancedCheckpointSummary {
  return {
    id: checkpoint.id,
    namespace: checkpoint.namespace,
    reason: checkpoint.reason,
    targetPath: checkpoint.targetPath,
    existed: checkpoint.existed,
    contentLength: checkpoint.content?.length ?? 0,
    createdAt: checkpoint.createdAt,
  };
}

async function buildMemoryPreview(params: {
  assistantId: string;
  assistantName?: string;
  maxPromptEntries?: number;
  ensureScope: boolean;
}): Promise<AssistantAdvancedMemoryPreview> {
  const memory = getMemoryService();
  const allScopes = await memory.listScopes();
  const assistantScopes = allScopes.filter((scope) => scope.assistantId === params.assistantId && !scope.orphaned);
  const existingDefaultScope = assistantScopes.find(
    (scope) =>
      scope.userId === DEFAULT_MEMORY_USER_ID &&
      scope.workspaceId === DEFAULT_MEMORY_WORKSPACE_ID &&
      !scope.teamId
  );
  const scope = params.ensureScope
    ? await memory.ensureScope({
        userId: DEFAULT_MEMORY_USER_ID,
        workspaceId: DEFAULT_MEMORY_WORKSPACE_ID,
        assistantId: params.assistantId,
        assistantName: params.assistantName,
      })
    : existingDefaultScope;
  const nextScopes =
    params.ensureScope && !existingDefaultScope
      ? [
          ...assistantScopes,
          {
            ...scope,
            entryCount: scope.entryCount ?? 0,
          },
        ]
      : assistantScopes;
  const memoryContext = scope
    ? await memory.buildPromptContext(scope.id, params.maxPromptEntries ?? DEFAULT_MEMORY_ENTRY_LIMIT)
    : '';

  return {
    scopeId: scope?.id ?? '',
    scopeCount: nextScopes.length,
    entryCount: nextScopes.reduce((sum, item) => sum + item.entryCount, 0),
    memoryContext,
  };
}

async function buildProfileMemoryPreview(
  profile: AssistantProfile,
  ensureScope: boolean
): Promise<AssistantAdvancedMemoryPreview> {
  return buildMemoryPreview({
    assistantId: profile.assistantId,
    assistantName: profile.assistantName,
    maxPromptEntries: profile.memory.maxPromptEntries,
    ensureScope,
  });
}

export function initAssistantAdvancedBridge(): void {
  const profiles = getAssistantProfileService();
  const checkpoints = getCheckpointService();
  const evolution = getSelfEvolutionService();
  const skills = getSkillManifestService();

  ipcBridge.assistantAdvanced.ensureProfile.provider((params) => profiles.ensureProfile(params));
  ipcBridge.assistantAdvanced.getOverview.provider(async ({ assistantId, assistantName }) => {
    const profile = await profiles.ensureProfile({ assistantId, assistantName });
    const [candidates, checkpointItems, skillFiles, memoryPreview] = await Promise.all([
      evolution.listCandidates(assistantId),
      checkpoints.listCheckpoints(),
      skills.listFileStatuses(),
      buildProfileMemoryPreview(profile, false),
    ]);

    return {
      profile,
      candidates,
      checkpoints: checkpointItems.map(summarizeCheckpoint),
      memoryPreview,
      contextFileStatuses: profile.context.allowedContextFiles.map(validateAllowedContextFile),
      skillFiles,
    };
  });
  ipcBridge.assistantAdvanced.getMemoryPreview.provider(async ({ assistantId, assistantName, maxPromptEntries }) =>
    buildMemoryPreview({ assistantId, assistantName, maxPromptEntries, ensureScope: false })
  );
  ipcBridge.assistantAdvanced.ensureMemoryScope.provider(async ({ assistantId, assistantName, maxPromptEntries }) =>
    buildMemoryPreview({ assistantId, assistantName, maxPromptEntries, ensureScope: true })
  );
  ipcBridge.assistantAdvanced.updateProfile.provider(({ assistantId, updates }) =>
    profiles.updateProfile(assistantId, updates)
  );
  ipcBridge.assistantAdvanced.approveCandidate.provider(({ id }) => evolution.approveCandidate(id));
  ipcBridge.assistantAdvanced.applyCandidate.provider(({ id }) => evolution.applyCandidate(id));
  ipcBridge.assistantAdvanced.createCandidate.provider((params) => evolution.createCandidate(params));
  ipcBridge.assistantAdvanced.rejectCandidate.provider(({ id }) => evolution.rejectCandidate(id));
  ipcBridge.assistantAdvanced.restoreCheckpoint.provider(({ id }) => checkpoints.restoreCheckpoint(id));
}
