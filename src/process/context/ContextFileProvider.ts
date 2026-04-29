/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import type { ContextBlock } from './types';

const MAX_CONTEXT_FILE_LENGTH = 12_000;

export interface LoadContextFilesParams {
  workspace: string;
  allowedFiles: string[];
}

function isWorkspaceRootFile(fileName: string): boolean {
  return !path.isAbsolute(fileName) && path.basename(fileName) === fileName && !fileName.includes('..');
}

function compactContent(content: string): string {
  return content.length <= MAX_CONTEXT_FILE_LENGTH ? content : `${content.slice(0, MAX_CONTEXT_FILE_LENGTH - 3)}...`;
}

export class ContextFileProvider {
  async loadContextFiles({ workspace, allowedFiles }: LoadContextFilesParams): Promise<ContextBlock[]> {
    const blocks: ContextBlock[] = [];
    const resolvedWorkspace = path.resolve(workspace);

    for (const fileName of allowedFiles) {
      if (!isWorkspaceRootFile(fileName)) {
        continue;
      }

      const filePath = path.resolve(resolvedWorkspace, fileName);
      if (!filePath.startsWith(resolvedWorkspace + path.sep)) {
        continue;
      }

      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          continue;
        }
        blocks.push({
          kind: 'context-file',
          source: fileName,
          content: compactContent(fs.readFileSync(filePath, 'utf-8').trim()),
        });
      } catch {
        // Missing context files are normal; only existing allowed files are loaded.
      }
    }

    return blocks;
  }
}
