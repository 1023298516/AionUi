# Assistant Advanced Settings Design

## Goal

Expose the assistant memory/profile upgrade in a user-visible, conservative settings surface without changing the current memory safety model: no automatic learning, no automatic deletion, no automatic self-evolution, and all mutable data remains user-reviewable.

## Placement

The feature belongs in the existing assistant edit drawer under `Settings -> Assistants`, because Profiles, Context Files, `@` references, skill protection, and self-evolution policies are all assistant-scoped. The existing `Memory` page remains the place to view and edit concrete memory entries by assistant, workspace, and team.

## User-Facing Sections

### Memory Policy

Show whether assistant memory is enabled and the maximum number of memory entries injected into prompts. Users can change both values and open the `Memory` page for the selected assistant's concrete entries.

Defaults stay conservative:

- Memory enabled.
- Maximum prompt entries: `20`.
- Memory content is only user-created or user-edited through the `Memory` page.

### Context

Expose two assistant-level switches:

- Context files enabled.
- `@` references enabled.

When context files are enabled, users can edit the allowed root-level file list. The default list is `.aionui.md`, `AGENTS.md`, `SOUL.md`, and `memory.rules.md`.

When references are enabled, supported references are:

- `@memory`
- `@workspace-memory`
- `@file:<relative-path>`
- `@diff`

The UI explains that referenced files must be inside the current workspace and are treated as context, not instructions.

### Skill Protection

Show whether skill manifest protection is enabled for the assistant. The default is enabled. The UI explains that user-modified skill files are not overwritten by managed updates.

### Self-Evolution Lab

Self-evolution remains disabled by default and approval-required by default. The UI exposes:

- Enable self-evolution candidates.
- Require approval before apply.
- List candidates for the selected assistant.
- Approve, apply, or reject candidates.

Applying a candidate still follows the existing guardrails:

- A candidate must be approved first.
- Applying creates a checkpoint when writing a file.
- Core source paths containing a `src` path segment are blocked.

### Checkpoints

Show recent checkpoints related to memory/profile/skill/evolution operations. Users can restore a checkpoint from the UI after a confirmation prompt.

## Architecture

Add a narrow IPC bridge for advanced assistant settings rather than overloading the existing memory bridge. The bridge aggregates existing services:

- `AssistantProfileService`
- `CheckpointService`
- `SkillManifestService`
- `SelfEvolutionService`

Renderer code uses a focused `AssistantAdvancedSettings` component embedded in `AssistantEditDrawer`. The drawer passes `activeAssistantId`, assistant name, and source state. The component owns advanced settings loading, saving, candidate actions, and checkpoint restore.

## Data Flow

1. Opening the assistant drawer loads the assistant profile via IPC.
2. If no profile exists, the profile service creates default conservative policy data.
3. Changing profile controls saves through `assistantAdvanced.updateProfile`.
4. Candidate and checkpoint actions call dedicated IPC methods and refresh local state.
5. Memory entries continue to use the existing `Memory` page and `ipcBridge.memory`.

## Error Handling

All bridge calls return direct service results or throw through the existing bridge mechanism. The UI catches failures and shows Arco `Message.error`. Destructive actions use `Popconfirm`.

## Testing

Add node-side unit tests for the advanced bridge provider behavior using fake services where practical. Add renderer tests for the `AssistantAdvancedSettings` component to verify:

- Default profile data is rendered.
- Profile changes call the update IPC method with the expected shape.
- Candidate actions are disabled or enabled based on status.
- Checkpoint restore uses a confirmation-protected action.

Run the existing memory compatibility check, targeted unit tests, TypeScript, and package build after implementation.

## Non-Goals

- No automatic memory learning.
- No Cognee backend UI in this step.
- No automatic conflict repair after official updates.
- No self-evolution write access to core source code.
- No redesign of the existing Memory page beyond linking to it.
