# Assistant Advanced Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conservative assistant-scoped advanced settings UI for memory profile policies, context files, `@` references, skill protection, self-evolution candidates, and checkpoints.

**Architecture:** Add a focused `assistantAdvanced` IPC bridge that wraps existing profile, checkpoint, skill manifest, and self-evolution services. Add a renderer component inside `AssistantEditDrawer` so users configure these assistant-scoped policies where they already edit assistants. Keep concrete memory entry management in the existing `Memory` page.

**Tech Stack:** Electron bridge via `@office-ai/platform`, TypeScript, React 19, Arco Design, Vitest.

---

## File Structure

- Modify `src/common/adapter/ipcBridge.ts` to expose `assistantAdvanced` providers and shared response types.
- Create `src/process/bridge/assistantAdvancedBridge.ts` to register provider handlers.
- Modify `src/process/bridge/index.ts` to initialize/export the new bridge.
- Modify `src/process/profiles/AssistantProfileService.ts` only if the UI needs accessors for policy sections already stored in profiles.
- Create `src/renderer/pages/settings/AssistantSettings/AssistantAdvancedSettings.tsx` as a focused drawer section.
- Modify `src/renderer/pages/settings/AssistantSettings/AssistantEditDrawer.tsx` to render the section.
- Add `tests/unit/assistantAdvancedBridge.test.ts` for bridge/service behavior.
- Add `tests/unit/AssistantAdvancedSettings.test.tsx` or follow the repo's renderer test placement if an existing pattern is present.

---

### Task 1: IPC Contract And Bridge

**Files:**
- Modify: `src/common/adapter/ipcBridge.ts`
- Create: `src/process/bridge/assistantAdvancedBridge.ts`
- Modify: `src/process/bridge/index.ts`
- Test: `tests/unit/assistantAdvancedBridge.test.ts`

- [ ] **Step 1: Write failing bridge tests**

Create `tests/unit/assistantAdvancedBridge.test.ts` with tests that register the bridge using fake services and verify these operations:

```ts
import { describe, expect, it, vi } from 'vitest';

describe('assistantAdvancedBridge', () => {
  it('ensures a conservative default profile for an assistant', async () => {
    const profile = await fakeBridge.assistantAdvanced.ensureProfile.invoke({
      assistantId: 'builtin-word',
      assistantName: 'Word',
    });

    expect(profile.memory.enabled).toBe(true);
    expect(profile.memory.maxPromptEntries).toBe(20);
    expect(profile.context.contextFilesEnabled).toBe(false);
    expect(profile.context.referencesEnabled).toBe(false);
    expect(profile.evolution.enabled).toBe(false);
    expect(profile.evolution.requireApproval).toBe(true);
    expect(profile.skills.manifestProtectionEnabled).toBe(true);
  });

  it('updates profile policy sections without replacing omitted sections', async () => {
    await fakeBridge.assistantAdvanced.ensureProfile.invoke({ assistantId: 'custom-writer' });

    const updated = await fakeBridge.assistantAdvanced.updateProfile.invoke({
      assistantId: 'custom-writer',
      updates: {
        memory: { enabled: false, maxPromptEntries: 8 },
        context: { referencesEnabled: true },
      },
    });

    expect(updated.memory).toEqual({ enabled: false, maxPromptEntries: 8 });
    expect(updated.context.contextFilesEnabled).toBe(false);
    expect(updated.context.referencesEnabled).toBe(true);
  });

  it('lists candidates and checkpoints for the advanced settings panel', async () => {
    const result = await fakeBridge.assistantAdvanced.getOverview.invoke({
      assistantId: 'custom-writer',
      assistantName: 'Writer',
    });

    expect(result.profile.assistantId).toBe('custom-writer');
    expect(result.candidates).toEqual([]);
    expect(result.checkpoints).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the new bridge test and verify RED**

Run: `npm exec vitest run tests/unit/assistantAdvancedBridge.test.ts -- --project node`

Expected: FAIL because `assistantAdvancedBridge` and `ipcBridge.assistantAdvanced` do not exist.

- [ ] **Step 3: Add IPC contract**

Add `assistantAdvanced` to `src/common/adapter/ipcBridge.ts` with providers:

```ts
export const assistantAdvanced = {
  ensureProfile: bridge.buildProvider<
    import('../types/assistantProfile').AssistantProfile,
    import('../types/assistantProfile').EnsureAssistantProfileParams
  >('assistant-advanced.ensure-profile'),
  getOverview: bridge.buildProvider<
    {
      profile: import('../types/assistantProfile').AssistantProfile;
      candidates: import('../types/selfEvolution').SelfEvolutionCandidate[];
      checkpoints: import('@process/checkpoints').FileCheckpoint[];
    },
    { assistantId: string; assistantName?: string }
  >('assistant-advanced.get-overview'),
  updateProfile: bridge.buildProvider<
    import('../types/assistantProfile').AssistantProfile,
    { assistantId: string; updates: import('../types/assistantProfile').UpdateAssistantProfileParams }
  >('assistant-advanced.update-profile'),
  approveCandidate: bridge.buildProvider<
    import('../types/selfEvolution').SelfEvolutionCandidate,
    { id: string }
  >('assistant-advanced.approve-candidate'),
  applyCandidate: bridge.buildProvider<
    { applied: true } | { applied: false; reason: string },
    { id: string }
  >('assistant-advanced.apply-candidate'),
  rejectCandidate: bridge.buildProvider<
    import('../types/selfEvolution').SelfEvolutionCandidate,
    { id: string }
  >('assistant-advanced.reject-candidate'),
  restoreCheckpoint: bridge.buildProvider<void, { id: string }>('assistant-advanced.restore-checkpoint'),
};
```

- [ ] **Step 4: Add bridge implementation**

Create `src/process/bridge/assistantAdvancedBridge.ts`:

```ts
import { ipcBridge } from '@/common';
import { getCheckpointService } from '@process/checkpoints';
import { getSelfEvolutionService } from '@process/evolution';
import { getAssistantProfileService } from '@process/profiles';

export function initAssistantAdvancedBridge(): void {
  const profiles = getAssistantProfileService();
  const checkpoints = getCheckpointService();
  const evolution = getSelfEvolutionService();

  ipcBridge.assistantAdvanced.ensureProfile.provider((params) => profiles.ensureProfile(params));
  ipcBridge.assistantAdvanced.getOverview.provider(async ({ assistantId, assistantName }) => ({
    profile: await profiles.ensureProfile({ assistantId, assistantName }),
    candidates: await evolution.listCandidates(assistantId),
    checkpoints: await checkpoints.listCheckpoints(),
  }));
  ipcBridge.assistantAdvanced.updateProfile.provider(({ assistantId, updates }) =>
    profiles.updateProfile(assistantId, updates)
  );
  ipcBridge.assistantAdvanced.approveCandidate.provider(({ id }) => evolution.approveCandidate(id));
  ipcBridge.assistantAdvanced.applyCandidate.provider(({ id }) => evolution.applyCandidate(id));
  ipcBridge.assistantAdvanced.rejectCandidate.provider(({ id }) =>
    evolution.updateCandidateStatus(id, 'rejected')
  );
  ipcBridge.assistantAdvanced.restoreCheckpoint.provider(({ id }) => checkpoints.restoreCheckpoint(id));
}
```

If `SelfEvolutionService` has no public reject method, add a small public method rather than exposing generic mutation.

- [ ] **Step 5: Register bridge**

Modify `src/process/bridge/index.ts` to import, initialize, and export `initAssistantAdvancedBridge`.

- [ ] **Step 6: Run bridge test and verify GREEN**

Run: `npm exec vitest run tests/unit/assistantAdvancedBridge.test.ts -- --project node`

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add src/common/adapter/ipcBridge.ts src/process/bridge/assistantAdvancedBridge.ts src/process/bridge/index.ts src/process/evolution/SelfEvolutionService.ts tests/unit/assistantAdvancedBridge.test.ts
git commit -m "add assistant advanced settings bridge"
```

---

### Task 2: Advanced Settings Component

**Files:**
- Create: `src/renderer/pages/settings/AssistantSettings/AssistantAdvancedSettings.tsx`
- Modify: `src/renderer/pages/settings/AssistantSettings/AssistantEditDrawer.tsx`
- Test: renderer unit test following existing repo pattern

- [ ] **Step 1: Write failing renderer test**

Write a test that renders `AssistantAdvancedSettings` with mocked `ipcBridge.assistantAdvanced.getOverview` and verifies:

```ts
expect(screen.getByText('Advanced')).toBeInTheDocument();
expect(screen.getByLabelText('Enable assistant memory')).toBeChecked();
expect(screen.getByLabelText('Enable context files')).not.toBeChecked();
expect(screen.getByLabelText('Enable @ references')).not.toBeChecked();
```

- [ ] **Step 2: Run renderer test and verify RED**

Run the focused renderer test command used by the repo for React component tests.

Expected: FAIL because `AssistantAdvancedSettings` does not exist.

- [ ] **Step 3: Implement component**

Create a component that:

- Accepts `assistantId`, `assistantName`, and `disabled`.
- Loads overview on mount and when `assistantId` changes.
- Renders `Collapse` sections for Memory Policy, Context, Skill Protection, Self-Evolution Lab, and Checkpoints.
- Saves profile updates through `ipcBridge.assistantAdvanced.updateProfile`.
- Uses `Message.error` for failed loads/saves.
- Uses `Popconfirm` for apply/reject/restore actions.

- [ ] **Step 4: Embed in drawer**

Modify `AssistantEditDrawer.tsx` to render:

```tsx
{!isCreating && activeAssistantId && (
  <AssistantAdvancedSettings
    assistantId={activeAssistantId}
    assistantName={editName || activeAssistant?.name}
    disabled={false}
  />
)}
```

Place it below the summary and above Rules so it is visible but not mixed with prompt editing.

- [ ] **Step 5: Run renderer test and verify GREEN**

Run the focused renderer test command.

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/renderer/pages/settings/AssistantSettings/AssistantAdvancedSettings.tsx src/renderer/pages/settings/AssistantSettings/AssistantEditDrawer.tsx tests
git commit -m "add assistant advanced settings panel"
```

---

### Task 3: Integration Verification

**Files:**
- Modify only if verification finds defects.

- [ ] **Step 1: Run compatibility check**

Run: `npm run memory:compat-check`

Expected: all checks pass.

- [ ] **Step 2: Run targeted unit tests**

Run:

```bash
npm exec vitest run tests/unit/profiles/assistantProfileService.test.ts tests/unit/checkpoints/checkpointService.test.ts tests/unit/evolution/selfEvolutionService.test.ts tests/unit/assistantAdvancedBridge.test.ts -- --project node
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript**

Run: `npx tsc --noEmit --pretty false`

Expected: no errors.

- [ ] **Step 4: Run package build**

Run: `npm run package`

Expected: build succeeds. Existing Vite warnings are acceptable if unchanged.

- [ ] **Step 5: Restart AionUi**

Stop repo-specific Electron/Node processes and run `npm start` from `D:\我的文档\文档\AionUi`.

Verify `http://127.0.0.1:9230/json/version` reports `AionUi-Dev/1.9.21`.

- [ ] **Step 6: Final commit if verification fixes were needed**

Commit only actual verification fixes. Do not create an empty commit.
