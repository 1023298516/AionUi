# AionUi Hermes-Inspired Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hermes-inspired assistant profiles, context hooks, context references, checkpoints, skill manifests, and self-evolution candidates while preserving AionUi's conservative user-controlled memory model.

**Architecture:** Keep new behavior behind focused process services and typed providers. The core conversation send path should only call small adapter functions; profile, hook, context, checkpoint, manifest, and evolution logic must remain separately testable.

**Tech Stack:** TypeScript, Vitest, existing AionUi IPC bridge patterns, local JSON stores under `getDataPath()`, existing memory compatibility checks.

---

## Scope

This plan intentionally avoids a large UI rebuild. It implements the backend and integration seams first, with lightweight IPC where needed. A later UI pass can expose richer controls without changing the underlying services.

## Stage Gates

Each stage must finish with:

- `npm exec vitest run <stage tests> -- --project node`
- `npm run memory:compat-check`
- `npx tsc --noEmit --pretty false`
- `git diff --check`
- A git commit for that stage

The final stage must additionally run:

- `npm exec vitest run tests/unit/memory tests/unit/conversationBridge.test.ts -- --project node`
- `npm run package`

## Stage 1: Assistant Profiles + Event Hooks

**Files:**
- Create `src/common/types/assistantProfile.ts`
- Create `src/process/profiles/AssistantProfileService.ts`
- Create `src/process/profiles/JsonAssistantProfileStore.ts`
- Create `src/process/profiles/index.ts`
- Create `src/process/hooks/AgentContextHookBus.ts`
- Create `tests/unit/profiles/assistantProfileService.test.ts`
- Create `tests/unit/hooks/agentContextHookBus.test.ts`
- Modify `src/process/memory/MemoryContextProvider.ts`

**Behavior:**
- Store profile policies per `assistantId`.
- Profile policy controls whether memory recall is enabled.
- Hook bus supports `beforeMemoryRecall`, `afterMemoryRecall`, `beforeSendToAgent`, and `afterTurnComplete`.
- `MemoryContextProvider` reads profile policy and runs hooks without knowing extension/plugin internals.

## Stage 2: Context Files + @ References

**Files:**
- Create `src/process/context/ContextFileProvider.ts`
- Create `src/process/context/ContextReferenceResolver.ts`
- Create `src/process/context/index.ts`
- Create `tests/unit/context/contextFileProvider.test.ts`
- Create `tests/unit/context/contextReferenceResolver.test.ts`
- Modify `src/process/memory/MemoryContextProvider.ts`

**Behavior:**
- Discover `.aionui.md`, `AGENTS.md`, `SOUL.md`, and `memory.rules.md` from the workspace root.
- Resolve explicit references: `@memory`, `@workspace-memory`, `@file:<path>`, and `@diff`.
- Only read files under the workspace root for `@file`.
- Inject context into `agentInput` as user-message context, never system prompt.

## Stage 3: Checkpoints

**Files:**
- Create `src/process/checkpoints/CheckpointService.ts`
- Create `src/process/checkpoints/index.ts`
- Create `tests/unit/checkpoints/checkpointService.test.ts`
- Modify memory/profile/skill/evolution services only where snapshots are needed.

**Behavior:**
- Create JSON checkpoints before changing memory, profiles, skill manifests, or evolution candidates.
- Store checkpoints under `getDataPath()/checkpoints`.
- Provide restore support for service-owned JSON stores.

## Stage 4: Skill Manifest

**Files:**
- Create `src/process/skills/SkillManifestService.ts`
- Create `src/process/skills/index.ts`
- Create `tests/unit/skills/skillManifestService.test.ts`

**Behavior:**
- Track origin hash and current hash for skill/config files.
- Identify unchanged, user-modified, and safe-to-update files.
- Do not overwrite user-modified files.

## Stage 5: Self-Evolution Lab

**Files:**
- Create `src/common/types/selfEvolution.ts`
- Create `src/process/evolution/SelfEvolutionService.ts`
- Create `src/process/evolution/index.ts`
- Create `tests/unit/evolution/selfEvolutionService.test.ts`

**Behavior:**
- Generate and store candidates for `skill`, `memory-rule`, and `profile-policy`.
- Candidates are inactive by default.
- Applying a candidate requires explicit approval and creates a checkpoint first.
- No core source code mutation.

## Stage 6: Full Integration Checks

**Files:**
- Modify `scripts/memory/compatCheck.ts`
- Modify `tests/unit/memory/compatCheck.test.ts`

**Behavior:**
- Compatibility checker verifies new seams exist.
- Final test/build run validates all stages together.

