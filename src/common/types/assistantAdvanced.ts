/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AssistantProfile } from './assistantProfile';
import type { SelfEvolutionCandidate } from './selfEvolution';

export interface AssistantAdvancedMemoryPreview {
  scopeId: string;
  scopeCount: number;
  entryCount: number;
  memoryContext: string;
}

export interface AssistantAdvancedContextFileStatus {
  fileName: string;
  valid: boolean;
  reason?: 'empty' | 'absolute' | 'nested' | 'parent-reference';
}

export type AssistantAdvancedSkillFileState = 'unchanged' | 'user-modified' | 'missing' | 'untracked';

export interface AssistantAdvancedSkillFileStatus {
  state: AssistantAdvancedSkillFileState;
  filePath: string;
  owner?: string;
  originHash?: string;
  currentHash?: string;
}

export interface AssistantAdvancedCheckpointSummary {
  id: string;
  namespace: string;
  reason: string;
  targetPath: string;
  existed: boolean;
  contentLength: number;
  createdAt: number;
}

export interface AssistantAdvancedOverview {
  profile: AssistantProfile;
  candidates: SelfEvolutionCandidate[];
  checkpoints: AssistantAdvancedCheckpointSummary[];
  memoryPreview: AssistantAdvancedMemoryPreview;
  contextFileStatuses: AssistantAdvancedContextFileStatus[];
  skillFiles: AssistantAdvancedSkillFileStatus[];
}
