import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantAdvancedOverview } from '@/common/types/assistantAdvanced';
import type { AssistantProfile } from '@/common/types/assistantProfile';

const { mockGetOverview, mockUpdateProfile, mockCreateCandidate, mockEnsureMemoryScope } = vi.hoisted(() => {
  const profile: AssistantProfile = {
    assistantId: 'custom-writer',
    assistantName: 'Writer',
    memory: { enabled: true, maxPromptEntries: 20 },
    context: {
      contextFilesEnabled: false,
      referencesEnabled: false,
      allowedContextFiles: ['.aionui.md', 'AGENTS.md', 'SOUL.md', 'memory.rules.md'],
    },
    evolution: { enabled: false, requireApproval: true },
    skills: { manifestProtectionEnabled: true, skillIds: [] },
    createdAt: 1,
    updatedAt: 2,
  };

  const overview: AssistantAdvancedOverview = {
    profile,
    candidates: [
      {
        id: 'candidate-1',
        assistantId: 'custom-writer',
        type: 'profile-policy',
        title: 'Prefer concise answers',
        content: 'Keep replies short unless the user asks for detail.',
        status: 'candidate',
        active: false,
        createdAt: 3,
        updatedAt: 4,
      },
    ],
    checkpoints: [
      {
        id: 'checkpoint-1',
        namespace: 'assistant-profile',
        reason: 'before assistant profile update',
        targetPath: 'D:/AionUi/profile.json',
        existed: true,
        contentLength: 17,
        createdAt: 5,
      },
    ],
    memoryPreview: {
      scopeId: 'memory-local-global-custom-writer',
      scopeCount: 1,
      entryCount: 2,
      memoryContext: '[AionUi Assistant Memory]\n- (fact) User prefers concise answers',
    },
    contextFileStatuses: [
      { fileName: '.aionui.md', valid: true },
      { fileName: 'AGENTS.md', valid: true },
    ],
    skillFiles: [
      {
        state: 'user-modified',
        filePath: 'D:/AionUi/skills/writer/SKILL.md',
        owner: 'custom-writer',
        originHash: 'origin',
        currentHash: 'current',
      },
    ],
  };

  return {
    mockGetOverview: vi.fn(async () => overview),
    mockUpdateProfile: vi.fn(async ({ updates }: { updates: Partial<AssistantProfile> }) => ({
      ...profile,
      ...updates,
      memory: updates.memory ? { ...profile.memory, ...updates.memory } : profile.memory,
      context: updates.context ? { ...profile.context, ...updates.context } : profile.context,
      evolution: updates.evolution ? { ...profile.evolution, ...updates.evolution } : profile.evolution,
      skills: updates.skills ? { ...profile.skills, ...updates.skills } : profile.skills,
    })),
    mockCreateCandidate: vi.fn(async () => overview.candidates[0]),
    mockEnsureMemoryScope: vi.fn(async () => overview.memoryPreview),
  };
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    assistantAdvanced: {
      getOverview: { invoke: mockGetOverview },
      ensureMemoryScope: { invoke: mockEnsureMemoryScope },
      getMemoryPreview: { invoke: vi.fn() },
      updateProfile: { invoke: mockUpdateProfile },
      approveCandidate: { invoke: vi.fn() },
      applyCandidate: { invoke: vi.fn() },
      createCandidate: { invoke: mockCreateCandidate },
      rejectCandidate: { invoke: vi.fn() },
      restoreCheckpoint: { invoke: vi.fn() },
    },
  },
}));

import AssistantAdvancedSettings from '@/renderer/pages/settings/AssistantSettings/AssistantAdvancedSettings';

async function renderSettings(): Promise<void> {
  render(
    <MemoryRouter>
      <AssistantAdvancedSettings assistantId='custom-writer' assistantName='Writer' />
    </MemoryRouter>
  );

  await screen.findByText('Advanced');
  await waitFor(() => {
    expect(screen.getByTestId('assistant-advanced-refresh').className).not.toContain('arco-btn-loading');
  });
}

describe('AssistantAdvancedSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders conservative default profile controls', async () => {
    await renderSettings();

    expect(screen.getByLabelText('Enable assistant memory')).toBeChecked();
    expect(screen.getByTestId('assistant-memory-preview-stats').textContent).toContain('1');
    fireEvent.click(screen.getByTestId('assistant-advanced-context-header'));
    expect(screen.getByLabelText('Enable context files')).not.toBeChecked();
    expect(screen.getByLabelText('Enable @ references')).not.toBeChecked();
    expect(screen.getByText('.aionui.md')).toBeTruthy();
    fireEvent.click(screen.getByTestId('assistant-advanced-evolution-header'));
    expect(screen.getByText('Prefer concise answers')).toBeTruthy();
  });

  it('saves memory policy changes through the advanced IPC bridge', async () => {
    await renderSettings();

    const memoryToggle = screen.getByLabelText('Enable assistant memory');
    fireEvent.click(memoryToggle);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        assistantId: 'custom-writer',
        updates: {
          memory: {
            enabled: false,
            maxPromptEntries: 20,
          },
        },
      });
    });
  });

  it('restores the default context whitelist through the advanced bridge', async () => {
    await renderSettings();
    fireEvent.click(screen.getByTestId('assistant-advanced-context-header'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore default context whitelist' }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        assistantId: 'custom-writer',
        updates: {
          context: {
            contextFilesEnabled: false,
            referencesEnabled: false,
            allowedContextFiles: ['.aionui.md', 'AGENTS.md', 'SOUL.md', 'memory.rules.md'],
          },
        },
      });
    });
  });

  it('blocks unsafe nested context whitelist entries before saving', async () => {
    await renderSettings();
    fireEvent.click(screen.getByTestId('assistant-advanced-context-header'));
    fireEvent.change(screen.getByLabelText('Allowed context files'), { target: { value: 'nested/path.md' } });
    fireEvent.blur(screen.getByLabelText('Allowed context files'));

    await waitFor(() => {
      expect(screen.getByText('Unsafe context file entry: nested/path.md')).toBeTruthy();
    });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('creates manual self-evolution candidates from the lab', async () => {
    await renderSettings();
    fireEvent.click(screen.getByTestId('assistant-advanced-evolution-header'));
    fireEvent.click(screen.getByRole('button', { name: 'Create evolution candidate' }));
    fireEvent.change(screen.getByLabelText('Candidate title'), { target: { value: 'New response policy' } });
    fireEvent.change(screen.getByLabelText('Candidate content'), { target: { value: 'Prefer explicit next steps.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));

    await waitFor(() => {
      expect(mockCreateCandidate).toHaveBeenCalledWith({
        assistantId: 'custom-writer',
        type: 'profile-policy',
        title: 'New response policy',
        content: 'Prefer explicit next steps.',
        targetPath: undefined,
      });
    });
  });

  it('shows checkpoint details before restore', async () => {
    await renderSettings();
    await act(async () => {
      fireEvent.click(screen.getByTestId('assistant-advanced-checkpoints-header'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'View checkpoint checkpoint-1' }));
    });

    expect(screen.getByText('Target: D:/AionUi/profile.json')).toBeTruthy();
    expect(screen.getByText('Namespace: assistant-profile')).toBeTruthy();
    expect(screen.getByText('Size: 17 bytes')).toBeTruthy();
  });
});
