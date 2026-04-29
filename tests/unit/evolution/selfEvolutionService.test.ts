import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CheckpointService } from '../../../src/process/checkpoints/CheckpointService';
import { SelfEvolutionService } from '../../../src/process/evolution/SelfEvolutionService';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aion-evolution-'));
}

describe('SelfEvolutionService', () => {
  it('creates inactive candidates by default', async () => {
    const dir = createTempDir();
    const service = new SelfEvolutionService(path.join(dir, 'evolution.json'));

    const candidate = await service.createCandidate({
      assistantId: 'assistant-1',
      type: 'memory-rule',
      title: 'Prefer concise memories',
      content: 'Only save durable user preferences.',
    });

    expect(candidate.status).toBe('candidate');
    expect(candidate.active).toBe(false);
  });

  it('refuses to apply candidates before approval', async () => {
    const dir = createTempDir();
    const targetPath = path.join(dir, 'skill.md');
    fs.writeFileSync(targetPath, 'old skill', 'utf-8');
    const service = new SelfEvolutionService(path.join(dir, 'evolution.json'));
    const candidate = await service.createCandidate({
      assistantId: 'assistant-1',
      type: 'skill',
      title: 'Improve writer skill',
      content: 'new skill',
      targetPath,
    });

    const result = await service.applyCandidate(candidate.id);

    expect(result).toEqual({ applied: false, reason: 'not-approved' });
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('old skill');
  });

  it('applies approved candidates with checkpoint protection', async () => {
    const dir = createTempDir();
    const targetPath = path.join(dir, 'skill.md');
    fs.writeFileSync(targetPath, 'old skill', 'utf-8');
    const checkpointService = new CheckpointService(path.join(dir, 'checkpoints'));
    const service = new SelfEvolutionService(path.join(dir, 'evolution.json'), checkpointService);
    const candidate = await service.createCandidate({
      assistantId: 'assistant-1',
      type: 'skill',
      title: 'Improve writer skill',
      content: 'new skill',
      targetPath,
    });
    await service.approveCandidate(candidate.id);

    const result = await service.applyCandidate(candidate.id);

    expect(result).toEqual({ applied: true });
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('new skill');
    expect(await checkpointService.listCheckpoints()).toHaveLength(1);
  });

  it('does not mutate core source files', async () => {
    const dir = createTempDir();
    const targetPath = path.join(dir, 'src', 'index.ts');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, 'old source', 'utf-8');
    const service = new SelfEvolutionService(path.join(dir, 'evolution.json'));
    const candidate = await service.createCandidate({
      assistantId: 'assistant-1',
      type: 'skill',
      title: 'Unsafe core change',
      content: 'new source',
      targetPath,
    });
    await service.approveCandidate(candidate.id);

    const result = await service.applyCandidate(candidate.id);

    expect(result).toEqual({ applied: false, reason: 'core-source-not-allowed' });
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('old source');
  });
});
