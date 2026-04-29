# Assistant Advanced Settings Completion Design

## Goal

Complete the assistant advanced settings surface so users can inspect and control memory, workspace context, skill protection, self-evolution candidates, and checkpoints from the assistant edit drawer without weakening the existing conservative memory model.

## Non-Negotiables

- No automatic memory learning.
- No automatic candidate application.
- No silent overwrite of user-modified skill files.
- Any destructive or state-changing action remains explicit and visible.
- Existing Memory page remains the source of truth for creating, editing, and deleting memory entries.
- All features remain assistant-scoped first, with workspace/team separation preserved by the existing memory scope identity.

## Feature Scope

### Memory Policy

- Show whether this assistant has memory enabled.
- Show max prompt injection count.
- Show a live assistant memory preview built from the same prompt-context formatter used by runtime injection.
- Show assistant memory scope count and entry count.
- Provide a button to ensure the default global memory scope exists.
- Keep the Memory page deep link for full CRUD.

### Context

- Keep toggles for workspace context files and `@memory` / `@file` / `@diff` references.
- Normalize allowed context files from textarea input.
- Reject unsafe allowed file names: absolute paths, nested paths, empty entries, and `..`.
- Add a restore-default-whitelist button.
- Show usage hints for supported references.

### Skill Protection

- Keep the Skill Manifest protection toggle.
- Show tracked skill file statuses from the manifest:
  - `unchanged`
  - `user-modified`
  - `missing`
  - `untracked`
- Make user-modified files obvious so official updates do not silently overwrite them.

### Self-Evolution Lab

- Keep candidate list and approve/apply/reject actions.
- Add manual candidate creation for controlled experiments.
- Add status filtering.
- Add detail preview before approval or application.
- Keep application blocked for core source paths through the existing service.

### Checkpoints

- Show recent checkpoints with namespace, target path, creation time, reason, and content size.
- Add namespace filtering.
- Add detail preview before restore.
- Keep restore behind confirmation.

## Compatibility Model

- Extend `assistantAdvanced` IPC instead of adding unrelated channels.
- Keep shared renderer-safe types under `src/common/types`.
- Keep process-only file inspection in process services/bridge.
- Keep `memory:compat-check` as the post-update conflict check.

## Acceptance Criteria

- Assistant advanced settings still open from assistant edit drawer.
- Memory preview can be refreshed and reflects current assistant profile max entries.
- Context file whitelist validation prevents unsafe entries from being saved.
- Skill protection section shows manifest file statuses.
- Self-evolution candidates can be created, filtered, previewed, approved, applied, and rejected.
- Checkpoints can be filtered, previewed, and restored with confirmation.
- `npm run memory:compat-check` passes.
- Targeted bridge and renderer tests pass.
- `npx tsc --noEmit --pretty false` passes.
