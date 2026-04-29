/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AssistantProfileMemoryPolicy {
  enabled: boolean;
  maxPromptEntries: number;
}

export interface AssistantProfileContextPolicy {
  contextFilesEnabled: boolean;
  referencesEnabled: boolean;
  allowedContextFiles: string[];
}

export interface AssistantProfileEvolutionPolicy {
  enabled: boolean;
  requireApproval: boolean;
}

export interface AssistantProfileSkillPolicy {
  manifestProtectionEnabled: boolean;
  skillIds: string[];
}

export interface AssistantProfile {
  assistantId: string;
  assistantName?: string;
  memory: AssistantProfileMemoryPolicy;
  context: AssistantProfileContextPolicy;
  evolution: AssistantProfileEvolutionPolicy;
  skills: AssistantProfileSkillPolicy;
  createdAt: number;
  updatedAt: number;
}

export interface AssistantProfileStoreData {
  version: number;
  profiles: AssistantProfile[];
}

export interface EnsureAssistantProfileParams {
  assistantId: string;
  assistantName?: string;
}

export type UpdateAssistantProfileParams = Partial<
  Pick<AssistantProfile, 'assistantName' | 'memory' | 'context' | 'evolution' | 'skills'>
>;
