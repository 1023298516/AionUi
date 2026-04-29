/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SelfEvolutionCandidateType = 'skill' | 'memory-rule' | 'profile-policy';
export type SelfEvolutionCandidateStatus = 'candidate' | 'approved' | 'applied' | 'rejected';

export interface SelfEvolutionCandidate {
  id: string;
  assistantId: string;
  type: SelfEvolutionCandidateType;
  title: string;
  content: string;
  targetPath?: string;
  status: SelfEvolutionCandidateStatus;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateSelfEvolutionCandidateParams {
  assistantId: string;
  type: SelfEvolutionCandidateType;
  title: string;
  content: string;
  targetPath?: string;
}

export interface SelfEvolutionStoreData {
  version: number;
  candidates: SelfEvolutionCandidate[];
}
