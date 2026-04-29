/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ContextBlockKind = 'context-file' | 'memory-reference' | 'file-reference' | 'diff-reference';

export interface ContextBlock {
  kind: ContextBlockKind;
  source: string;
  content: string;
}
