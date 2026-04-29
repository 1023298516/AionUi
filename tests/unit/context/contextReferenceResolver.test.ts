import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ContextReferenceResolver } from '../../../src/process/context/ContextReferenceResolver';

function createWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aion-context-ref-'));
}

describe('ContextReferenceResolver', () => {
  it('resolves @memory into an explicit context block', async () => {
    const resolver = new ContextReferenceResolver();

    const result = await resolver.resolve({
      input: 'Use @memory and summarize.',
      workspace: createWorkspace(),
      memoryContext: '[AionUi Assistant Memory]\n- Remember concise output.',
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      kind: 'memory-reference',
      source: '@memory',
      content: '[AionUi Assistant Memory]\n- Remember concise output.',
    });
  });

  it('resolves @file references under workspace only', async () => {
    const workspace = createWorkspace();
    fs.writeFileSync(path.join(workspace, 'brief.md'), 'Project brief', 'utf-8');
    const resolver = new ContextReferenceResolver();

    const result = await resolver.resolve({
      input: 'Read @file:brief.md',
      workspace,
      memoryContext: '',
    });

    expect(result.blocks).toEqual([
      {
        kind: 'file-reference',
        source: '@file:brief.md',
        content: 'Project brief',
      },
    ]);
  });

  it('rejects @file path traversal outside workspace', async () => {
    const workspace = createWorkspace();
    const outside = path.join(workspace, '..', 'outside.md');
    fs.writeFileSync(outside, 'secret', 'utf-8');
    const resolver = new ContextReferenceResolver();

    const result = await resolver.resolve({
      input: 'Read @file:../outside.md',
      workspace,
      memoryContext: '',
    });

    expect(result.blocks).toEqual([]);
  });

  it('resolves @diff through an injected diff provider', async () => {
    const resolver = new ContextReferenceResolver();

    const result = await resolver.resolve({
      input: 'Review @diff',
      workspace: createWorkspace(),
      memoryContext: '',
      diffProvider: async () => 'diff --git a/file b/file',
    });

    expect(result.blocks).toEqual([
      {
        kind: 'diff-reference',
        source: '@diff',
        content: 'diff --git a/file b/file',
      },
    ]);
  });
});
