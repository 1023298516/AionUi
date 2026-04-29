/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import type { ContextBlock } from './types';

const MAX_REFERENCE_FILE_LENGTH = 12_000;
const FILE_REFERENCE_PATTERN = /@file:([^\s]+)/g;

export interface ResolveContextReferencesParams {
  input: string;
  workspace: string;
  memoryContext: string;
  diffProvider?: (workspace: string) => Promise<string>;
}

export interface ResolvedContextReferences {
  blocks: ContextBlock[];
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function compactContent(content: string): string {
  return content.length <= MAX_REFERENCE_FILE_LENGTH ? content : `${content.slice(0, MAX_REFERENCE_FILE_LENGTH - 3)}...`;
}

export class ContextReferenceResolver {
  async resolve({
    input,
    workspace,
    memoryContext,
    diffProvider,
  }: ResolveContextReferencesParams): Promise<ResolvedContextReferences> {
    const blocks: ContextBlock[] = [];
    const resolvedWorkspace = path.resolve(workspace);

    if ((input.includes('@memory') || input.includes('@workspace-memory')) && memoryContext.trim()) {
      blocks.push({
        kind: 'memory-reference',
        source: input.includes('@workspace-memory') ? '@workspace-memory' : '@memory',
        content: memoryContext,
      });
    }

    for (const match of input.matchAll(FILE_REFERENCE_PATTERN)) {
      const requestedPath = match[1];
      if (!requestedPath || path.isAbsolute(requestedPath)) {
        continue;
      }

      const filePath = path.resolve(resolvedWorkspace, requestedPath);
      if (!isPathInside(resolvedWorkspace, filePath)) {
        continue;
      }

      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          continue;
        }
        blocks.push({
          kind: 'file-reference',
          source: `@file:${requestedPath}`,
          content: compactContent(fs.readFileSync(filePath, 'utf-8').trim()),
        });
      } catch {
        // Ignore missing or unreadable references; unresolved references stay in the user request.
      }
    }

    if (input.includes('@diff') && diffProvider) {
      const diff = (await diffProvider(resolvedWorkspace)).trim();
      if (diff) {
        blocks.push({
          kind: 'diff-reference',
          source: '@diff',
          content: compactContent(diff),
        });
      }
    }

    return { blocks };
  }
}
