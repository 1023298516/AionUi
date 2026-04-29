import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ContextFileProvider } from '../../../src/process/context/ContextFileProvider';

function createWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aion-context-workspace-'));
}

describe('ContextFileProvider', () => {
  it('loads only allowed context files from the workspace root', async () => {
    const workspace = createWorkspace();
    fs.writeFileSync(path.join(workspace, '.aionui.md'), 'Aion project rules', 'utf-8');
    fs.writeFileSync(path.join(workspace, 'AGENTS.md'), 'Agent rules', 'utf-8');
    fs.writeFileSync(path.join(workspace, 'ignored.md'), 'Do not load', 'utf-8');

    const provider = new ContextFileProvider();
    const blocks = await provider.loadContextFiles({
      workspace,
      allowedFiles: ['.aionui.md', 'AGENTS.md'],
    });

    expect(blocks.map((block) => block.source)).toEqual(['.aionui.md', 'AGENTS.md']);
    expect(blocks.map((block) => block.content)).toEqual(['Aion project rules', 'Agent rules']);
  });

  it('ignores nested or path-traversal context file names', async () => {
    const workspace = createWorkspace();
    fs.mkdirSync(path.join(workspace, 'nested'));
    fs.writeFileSync(path.join(workspace, 'nested', 'AGENTS.md'), 'Nested rules', 'utf-8');

    const provider = new ContextFileProvider();
    const blocks = await provider.loadContextFiles({
      workspace,
      allowedFiles: ['nested/AGENTS.md', '../outside.md'],
    });

    expect(blocks).toEqual([]);
  });
});
