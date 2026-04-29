import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CheckpointService } from '../../../src/process/checkpoints/CheckpointService';
import { JsonMemoryStore } from '../../../src/process/memory/JsonMemoryStore';
import { MemoryService } from '../../../src/process/memory/MemoryService';
import { AssistantProfileService } from '../../../src/process/profiles/AssistantProfileService';
import { JsonAssistantProfileStore } from '../../../src/process/profiles/JsonAssistantProfileStore';

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('CheckpointService', () => {
  it('creates and restores file checkpoints', async () => {
    const dir = createTempDir('aion-checkpoint-');
    const targetPath = path.join(dir, 'data.json');
    fs.writeFileSync(targetPath, '{"value":1}', 'utf-8');
    const service = new CheckpointService(path.join(dir, 'checkpoints'));

    const checkpoint = await service.createCheckpoint({
      targetPath,
      namespace: 'memory',
      reason: 'before update',
    });
    fs.writeFileSync(targetPath, '{"value":2}', 'utf-8');
    await service.restoreCheckpoint(checkpoint.id);

    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('{"value":1}');
  });

  it('restores missing-file checkpoints by deleting the target', async () => {
    const dir = createTempDir('aion-checkpoint-missing-');
    const targetPath = path.join(dir, 'data.json');
    const service = new CheckpointService(path.join(dir, 'checkpoints'));

    const checkpoint = await service.createCheckpoint({
      targetPath,
      namespace: 'profile',
      reason: 'before first write',
    });
    fs.writeFileSync(targetPath, '{"value":1}', 'utf-8');
    await service.restoreCheckpoint(checkpoint.id);

    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it('memory entry changes create checkpoints', async () => {
    const dir = createTempDir('aion-memory-checkpoint-');
    const checkpointService = new CheckpointService(path.join(dir, 'checkpoints'));
    const memoryService = new MemoryService(
      new JsonMemoryStore(path.join(dir, 'memory.json')),
      checkpointService
    );
    const scope = await memoryService.ensureScope({ userId: 'local', workspaceId: 'global', assistantId: 'a1' });

    await memoryService.upsertEntry({ scopeId: scope.id, kind: 'fact', content: 'Remember this.' });

    expect(await checkpointService.listCheckpoints()).toHaveLength(1);
  });

  it('profile updates create checkpoints', async () => {
    const dir = createTempDir('aion-profile-checkpoint-');
    const checkpointService = new CheckpointService(path.join(dir, 'checkpoints'));
    const profileService = new AssistantProfileService(
      new JsonAssistantProfileStore(path.join(dir, 'profiles.json')),
      checkpointService
    );
    await profileService.ensureProfile({ assistantId: 'a1' });

    await profileService.updateProfile('a1', { memory: { enabled: false, maxPromptEntries: 3 } });

    expect(await checkpointService.listCheckpoints()).toHaveLength(1);
  });
});
