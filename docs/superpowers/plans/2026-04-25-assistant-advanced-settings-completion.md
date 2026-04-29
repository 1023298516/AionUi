# Assistant Advanced Settings Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the assistant advanced settings panel with inspectable memory preview, safe context whitelist editing, skill manifest status visibility, self-evolution candidate creation/preview, and checkpoint detail filtering.

**Architecture:** Extend the existing `assistantAdvanced` IPC bridge as the single integration surface. Keep shared DTOs in `src/common/types`, process-only file and memory access in process services, and renderer state in `AssistantAdvancedSettings.tsx`.

**Tech Stack:** TypeScript, React 19, Arco Design, Vitest, Electron IPC bridge.

---

## File Structure

- Create `src/common/types/assistantAdvanced.ts`: shared DTOs for overview, memory preview, skill statuses, context validation, and checkpoint summaries.
- Modify `src/process/bridge/assistantAdvancedBridge.ts`: add memory preview, default memory scope creation, candidate creation, and skill manifest status data.
- Modify `src/process/skills/SkillManifestService.ts`: add a public list method for tracked file statuses.
- Modify `src/common/adapter/ipcBridge.ts`: add typed providers for new advanced settings operations and remove renderer dependency on process checkpoint types.
- Modify `src/renderer/pages/settings/AssistantSettings/AssistantAdvancedSettings.tsx`: complete UI controls and validation.
- Modify `tests/unit/bridge/assistantAdvancedBridge.test.ts`: cover new bridge behaviors.
- Modify `tests/unit/renderer/settings/AssistantAdvancedSettings.dom.test.tsx`: cover new UI behaviors.
- Optionally create `tests/unit/skills/skillManifestService.test.ts` if service-level coverage is needed after bridge tests.

---

### Task 1: Shared DTOs And Bridge Contract

**Files:**
- Create: `src/common/types/assistantAdvanced.ts`
- Modify: `src/common/adapter/ipcBridge.ts`
- Test: `tests/unit/bridge/assistantAdvancedBridge.test.ts`

- [ ] **Step 1: Write failing bridge tests**

Add tests that expect `getOverview` to include `memoryPreview`, `skillFiles`, and `contextFileStatuses`; expect `ensureMemoryScope` to return the default scope preview; expect `createCandidate` to create a candidate.

Run: `npx vitest run tests/unit/bridge/assistantAdvancedBridge.test.ts --reporter=dot`

Expected: FAIL because the new IPC providers and overview fields do not exist.

- [ ] **Step 2: Add shared DTO file**

Define these exported types in `src/common/types/assistantAdvanced.ts`:

```ts
export interface AssistantAdvancedMemoryPreview {
  scopeId: string;
  scopeCount: number;
  entryCount: number;
  memoryContext: string;
}

export interface AssistantAdvancedContextFileStatus {
  fileName: string;
  valid: boolean;
  reason?: 'empty' | 'absolute' | 'nested' | 'parent-reference';
}

export type AssistantAdvancedSkillFileState = 'unchanged' | 'user-modified' | 'missing' | 'untracked';

export interface AssistantAdvancedSkillFileStatus {
  state: AssistantAdvancedSkillFileState;
  filePath: string;
  owner?: string;
  originHash?: string;
  currentHash?: string;
}

export interface AssistantAdvancedCheckpointSummary {
  id: string;
  namespace: string;
  reason: string;
  targetPath: string;
  existed: boolean;
  contentLength: number;
  createdAt: number;
}
```

- [ ] **Step 3: Extend IPC contract**

Import the shared types in `src/common/adapter/ipcBridge.ts` and add these providers under `assistantAdvanced`:

```ts
getMemoryPreview
ensureMemoryScope
createCandidate
```

Extend `getOverview` result with:

```ts
memoryPreview: AssistantAdvancedMemoryPreview;
contextFileStatuses: AssistantAdvancedContextFileStatus[];
skillFiles: AssistantAdvancedSkillFileStatus[];
checkpoints: AssistantAdvancedCheckpointSummary[];
```

- [ ] **Step 4: Run bridge test**

Run: `npx vitest run tests/unit/bridge/assistantAdvancedBridge.test.ts --reporter=dot`

Expected: still FAIL until Task 2 implements process bridge behavior.

---

### Task 2: Process Bridge And Services

**Files:**
- Modify: `src/process/bridge/assistantAdvancedBridge.ts`
- Modify: `src/process/skills/SkillManifestService.ts`
- Test: `tests/unit/bridge/assistantAdvancedBridge.test.ts`

- [ ] **Step 1: Add SkillManifestService list behavior**

Add `listFileStatuses()` that reads the manifest entries and returns `getFileStatus(entry.filePath)` for each tracked file.

- [ ] **Step 2: Add process helpers**

In `assistantAdvancedBridge.ts`, add helpers for:

```ts
buildMemoryPreview({ assistantId, assistantName, maxPromptEntries })
validateAllowedContextFiles(files)
summarizeCheckpoints(checkpoints)
```

Use `getMemoryService().ensureScope({ userId: 'local', workspaceId: 'global', assistantId, assistantName })` for default assistant memory preview.

- [ ] **Step 3: Register providers**

Register providers for:

```ts
getMemoryPreview
ensureMemoryScope
createCandidate
```

Extend `getOverview` to return memory preview, context validation, skill file statuses, and summarized checkpoints.

- [ ] **Step 4: Run bridge test**

Run: `npx vitest run tests/unit/bridge/assistantAdvancedBridge.test.ts --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit bridge stage**

Run:

```powershell
git add src/common/types/assistantAdvanced.ts src/common/adapter/ipcBridge.ts src/process/bridge/assistantAdvancedBridge.ts src/process/skills/SkillManifestService.ts tests/unit/bridge/assistantAdvancedBridge.test.ts
git commit -m "feat: complete assistant advanced bridge"
```

---

### Task 3: Renderer UI Completion

**Files:**
- Modify: `src/renderer/pages/settings/AssistantSettings/AssistantAdvancedSettings.tsx`
- Test: `tests/unit/renderer/settings/AssistantAdvancedSettings.dom.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

Add tests that assert:

- Memory preview stats render after overview load.
- Restore default whitelist calls `updateProfile` with the default safe file list.
- Invalid nested context file does not call `updateProfile`.
- Manual candidate creation calls `createCandidate`.
- Checkpoint detail renders target path and namespace.

Run: `npx vitest run tests/unit/renderer/settings/AssistantAdvancedSettings.dom.test.tsx --reporter=dot`

Expected: FAIL because the UI does not expose these controls yet.

- [ ] **Step 2: Implement memory preview UI**

Render scope count, entry count, preview text, refresh, ensure default scope, and Memory page link.

- [ ] **Step 3: Implement safe context UI**

Normalize allowed file textarea with `/[\n,，]+/`, validate unsafe names, show inline tags, and add a restore default whitelist button.

- [ ] **Step 4: Implement skill status UI**

Render skill manifest file status rows and clearly distinguish `user-modified`, `missing`, `unchanged`, and empty manifest state.

- [ ] **Step 5: Implement self-evolution lab UI**

Add status filter, detail preview, and manual candidate creation modal with type, title, target path, and content.

- [ ] **Step 6: Implement checkpoint UI**

Add namespace filter, detail preview modal, and explicit restore confirmation.

- [ ] **Step 7: Run renderer test**

Run: `npx vitest run tests/unit/renderer/settings/AssistantAdvancedSettings.dom.test.tsx --reporter=dot`

Expected: PASS.

- [ ] **Step 8: Commit renderer stage**

Run:

```powershell
git add src/renderer/pages/settings/AssistantSettings/AssistantAdvancedSettings.tsx tests/unit/renderer/settings/AssistantAdvancedSettings.dom.test.tsx
git commit -m "feat: complete assistant advanced settings ui"
```

---

### Task 4: Full Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run targeted tests**

Run:

```powershell
npx vitest run tests/unit/bridge/assistantAdvancedBridge.test.ts tests/unit/renderer/settings/AssistantAdvancedSettings.dom.test.tsx --reporter=dot
```

Expected: PASS.

- [ ] **Step 2: Run compatibility check**

Run: `npm run memory:compat-check`

Expected: PASS with all checks green.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit --pretty false`

Expected: exit code 0.

- [ ] **Step 4: Run diff whitespace check**

Run: `git diff --check`

Expected: exit code 0.

- [ ] **Step 5: Restart AionUi**

Stop repo-bound Electron/Node processes and run:

```powershell
npm start
```

Confirm CDP reports `AionUi-Dev/1.9.21`.

- [ ] **Step 6: Final commit if verification-only fixes were needed**

Commit only if code changed during verification.
