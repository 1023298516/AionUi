/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MemoryScopeIdentity } from '@/common/types/memory';

function encodeScopePart(value: string): string {
  return encodeURIComponent(value);
}

export function buildMemoryScopeId(identity: MemoryScopeIdentity): string {
  const parts = [
    `user:${encodeScopePart(identity.userId)}`,
    `workspace:${encodeScopePart(identity.workspaceId)}`,
  ];

  if (identity.teamId) {
    parts.push(`team:${encodeScopePart(identity.teamId)}`);
  }

  parts.push(`assistant:${encodeScopePart(identity.assistantId)}`);
  return parts.join('/');
}

export function normalizeMemoryScopeIdentity(identity: Partial<MemoryScopeIdentity>): MemoryScopeIdentity {
  return {
    userId: identity.userId || 'local',
    workspaceId: identity.workspaceId || 'global',
    assistantId: identity.assistantId || 'unknown-assistant',
    teamId: identity.teamId || undefined,
  };
}
