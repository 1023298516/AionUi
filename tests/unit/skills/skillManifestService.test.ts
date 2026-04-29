import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CheckpointService } from '../../../src/process/checkpoints/CheckpointService';
import { SkillManifestService } from '../../../src/process/skills/SkillManifestService';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aion-skill-manifest-'));
}

describe('SkillManifestService', () => {
  it('tracks a file origin hash and reports unchanged status', async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'skill.md');
    fs.writeFileSync(filePath, 'original skill', 'utf-8');
    const service = new SkillManifestService(path.join(dir, 'manifest.json'));

    await service.trackFile({ filePath, owner: 'builtin:demo' });

    await expect(service.getFileStatus(filePath)).resolves.toMatchObject({
      state: 'unchanged',
      owner: 'builtin:demo',
    });
  });

  it('detects user-modified files and refuses to overwrite them', async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'skill.md');
    fs.writeFileSync(filePath, 'original skill', 'utf-8');
    const service = new SkillManifestService(path.join(dir, 'manifest.json'));
    await service.trackFile({ filePath, owner: 'builtin:demo' });
    fs.writeFileSync(filePath, 'user custom skill', 'utf-8');

    const result = await service.applyUpdate({ filePath, owner: 'builtin:demo', content: 'official update' });

    expect(result).toEqual({ applied: false, reason: 'user-modified' });
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('user custom skill');
  });

  it('applies updates to unchanged files and creates a checkpoint', async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'skill.md');
    fs.writeFileSync(filePath, 'original skill', 'utf-8');
    const checkpointService = new CheckpointService(path.join(dir, 'checkpoints'));
    const service = new SkillManifestService(path.join(dir, 'manifest.json'), checkpointService);
    await service.trackFile({ filePath, owner: 'builtin:demo' });

    const result = await service.applyUpdate({ filePath, owner: 'builtin:demo', content: 'official update' });

    expect(result).toEqual({ applied: true });
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('official update');
    expect(await checkpointService.listCheckpoints()).toHaveLength(1);
    await expect(service.getFileStatus(filePath)).resolves.toMatchObject({ state: 'unchanged' });
  });
});
