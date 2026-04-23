import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { buildMemoryScope, runMemoryCompatCheck } from '../../../scripts/memory/compatCheck';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

describe('buildMemoryScope', () => {
  it('uses user, workspace, and assistant for solo assistant memory', () => {
    expect(
      buildMemoryScope({
        userId: 'u1',
        workspaceId: 'D:/work/demo',
        assistantId: 'assistant-a',
      })
    ).toEqual('user:u1/workspace:D%3A%2Fwork%2Fdemo/assistant:assistant-a');
  });

  it('adds team between workspace and assistant for team memory', () => {
    expect(
      buildMemoryScope({
        userId: 'u1',
        workspaceId: 'D:/work/demo',
        teamId: 'team-a',
        assistantId: 'assistant-a',
      })
    ).toEqual('user:u1/workspace:D%3A%2Fwork%2Fdemo/team:team-a/assistant:assistant-a');
  });
});

describe('runMemoryCompatCheck', () => {
  it('writes json and fix prompt reports', async () => {
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-memory-report-'));

    const report = await runMemoryCompatCheck({ repoRoot, reportDir });

    expect(report.ok).toBe(true);
    expect(fs.existsSync(path.join(reportDir, 'latest-report.json'))).toBe(true);
    expect(fs.existsSync(path.join(reportDir, 'latest-fix-prompt.md'))).toBe(true);
  });
});
