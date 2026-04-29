import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { AssistantProfileService } from '../../../src/process/profiles/AssistantProfileService';
import { JsonAssistantProfileStore } from '../../../src/process/profiles/JsonAssistantProfileStore';

function createService(): AssistantProfileService {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-profile-store-'));
  return new AssistantProfileService(new JsonAssistantProfileStore(path.join(dir, 'profiles.json')));
}

describe('AssistantProfileService', () => {
  it('creates a conservative default profile for an assistant', async () => {
    const service = createService();

    const profile = await service.ensureProfile({ assistantId: 'assistant-1', assistantName: 'Writer' });

    expect(profile.assistantId).toBe('assistant-1');
    expect(profile.assistantName).toBe('Writer');
    expect(profile.memory.enabled).toBe(true);
    expect(profile.memory.maxPromptEntries).toBe(20);
    expect(profile.context.contextFilesEnabled).toBe(false);
    expect(profile.context.referencesEnabled).toBe(false);
    expect(profile.evolution.enabled).toBe(false);
    expect(profile.evolution.requireApproval).toBe(true);
  });

  it('returns memory policy for a configured assistant', async () => {
    const service = createService();
    await service.ensureProfile({ assistantId: 'assistant-1' });
    await service.updateProfile('assistant-1', {
      memory: { enabled: false, maxPromptEntries: 5 },
    });

    await expect(service.getMemoryPolicy('assistant-1')).resolves.toEqual({
      enabled: false,
      maxPromptEntries: 5,
    });
  });

  it('keeps partial updates isolated to the targeted policy section', async () => {
    const service = createService();
    await service.ensureProfile({ assistantId: 'assistant-1' });

    const updated = await service.updateProfile('assistant-1', {
      context: { contextFilesEnabled: true, referencesEnabled: true },
    });

    expect(updated.context.contextFilesEnabled).toBe(true);
    expect(updated.context.referencesEnabled).toBe(true);
    expect(updated.memory.enabled).toBe(true);
    expect(updated.evolution.enabled).toBe(false);
  });

  it('returns context policy for a configured assistant', async () => {
    const service = createService();
    await service.ensureProfile({ assistantId: 'assistant-1' });
    await service.updateProfile('assistant-1', {
      context: { contextFilesEnabled: true, referencesEnabled: true, allowedContextFiles: ['AGENTS.md'] },
    });

    await expect(service.getContextPolicy('assistant-1')).resolves.toEqual({
      contextFilesEnabled: true,
      referencesEnabled: true,
      allowedContextFiles: ['AGENTS.md'],
    });
  });
});
