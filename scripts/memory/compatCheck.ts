import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export type MemoryCompatSeverity = 'error' | 'warning';

export interface MemoryScopeInput {
  userId: string;
  workspaceId: string;
  assistantId: string;
  teamId?: string;
}

export interface MemoryCompatIssue {
  id: string;
  severity: MemoryCompatSeverity;
  message: string;
  files: string[];
  expected: string;
  actual: string;
}

export interface MemoryCompatCheckResult {
  id: string;
  title: string;
  ok: boolean;
  files: string[];
}

export interface MemoryCompatReport {
  ok: boolean;
  checkedAt: string;
  repoRoot: string;
  checks: MemoryCompatCheckResult[];
  issues: MemoryCompatIssue[];
}

export interface MemoryCompatCheckOptions {
  repoRoot?: string;
  reportDir?: string;
}

interface SourceCheck {
  id: string;
  title: string;
  files: string[];
  expected: string;
  patterns: Array<string | RegExp>;
}

function encodeScopePart(value: string): string {
  return encodeURIComponent(value);
}

export function buildMemoryScope(input: MemoryScopeInput): string {
  const parts = [`user:${encodeScopePart(input.userId)}`, `workspace:${encodeScopePart(input.workspaceId)}`];
  if (input.teamId) {
    parts.push(`team:${encodeScopePart(input.teamId)}`);
  }
  parts.push(`assistant:${encodeScopePart(input.assistantId)}`);
  return parts.join('/');
}

function normalizeRoot(repoRoot?: string): string {
  return path.resolve(repoRoot ?? process.cwd());
}

function readRepoFile(repoRoot: string, relativePath: string): string | null {
  const absolutePath = path.join(repoRoot, relativePath);
  try {
    return fs.readFileSync(absolutePath, 'utf-8');
  } catch {
    return null;
  }
}

function fileContains(content: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return content.includes(pattern);
  }
  return pattern.test(content);
}

function runSourceCheck(repoRoot: string, check: SourceCheck): { result: MemoryCompatCheckResult; issues: MemoryCompatIssue[] } {
  const issues: MemoryCompatIssue[] = [];
  const missingFiles: string[] = [];
  const fileContents = new Map<string, string>();

  for (const file of check.files) {
    const content = readRepoFile(repoRoot, file);
    if (content === null) {
      missingFiles.push(file);
      continue;
    }
    fileContents.set(file, content);
  }

  if (missingFiles.length > 0) {
    issues.push({
      id: check.id,
      severity: 'error',
      message: `${check.title} cannot run because required files are missing.`,
      files: missingFiles,
      expected: check.expected,
      actual: `Missing files: ${missingFiles.join(', ')}`,
    });
  }

  const missingPatterns = check.patterns.filter((pattern) => {
    for (const content of fileContents.values()) {
      if (fileContains(content, pattern)) {
        return false;
      }
    }
    return true;
  });

  if (missingPatterns.length > 0) {
    issues.push({
      id: check.id,
      severity: 'error',
      message: `${check.title} no longer matches the expected AionUi integration seam.`,
      files: check.files,
      expected: check.expected,
      actual: `Missing patterns: ${missingPatterns.map(String).join(', ')}`,
    });
  }

  return {
    result: {
      id: check.id,
      title: check.title,
      ok: issues.length === 0,
      files: check.files,
    },
    issues,
  };
}

function getChecks(): SourceCheck[] {
  return [
    {
      id: 'extension-contributions',
      title: 'Extension manifest still supports memory module contribution types',
      files: ['src/process/extensions/types.ts'],
      expected: 'Extension schema supports mcpServers, skills, assistants, and settingsTabs.',
      patterns: ['mcpServers:', 'skills:', 'assistants:', 'settingsTabs:'],
    },
    {
      id: 'extension-scan-path',
      title: 'Extension loader still supports external memory extension paths',
      files: ['src/process/extensions/constants.ts', 'src/process/extensions/ExtensionLoader.ts'],
      expected: 'AIONUI_EXTENSIONS_PATH and getExtensionScanSources are available for upgrade-safe external extensions.',
      patterns: ['AIONUI_EXTENSIONS_PATH', 'getExtensionScanSources'],
    },
    {
      id: 'mcp-injection-seams',
      title: 'ACP session still exposes builtin and team MCP injection seams',
      files: ['src/process/agent/acp/mcpSessionConfig.ts'],
      expected: 'Memory MCP can be injected alongside builtin and team MCP servers.',
      patterns: ['buildBuiltinAcpSessionMcpServers', 'buildTeamMcpServer', 'TeamMcpStdioConfig'],
    },
    {
      id: 'assistant-session-identity',
      title: 'Conversation creation still carries assistant and team identity',
      files: ['src/common/adapter/ipcBridge.ts'],
      expected: 'Conversation params expose presetAssistantId and teamId for memory scope construction.',
      patterns: ['presetAssistantId?: string', 'teamId?: string'],
    },
    {
      id: 'team-workspace-schema',
      title: 'Team schema still contains workspace isolation fields',
      files: ['src/process/services/database/schema.ts'],
      expected: 'teams table contains workspace, workspace_mode, and agents for workspace/team memory isolation.',
      patterns: ['CREATE TABLE IF NOT EXISTS teams', 'workspace TEXT NOT NULL', 'workspace_mode TEXT NOT NULL', 'agents TEXT NOT NULL'],
    },
    {
      id: 'database-versioning',
      title: 'Database versioning still exists for future memory migrations',
      files: ['src/process/services/database/schema.ts', 'src/process/services/database/migrations.ts'],
      expected: 'Core database still uses CURRENT_DB_VERSION and IMigration so memory migrations can be evaluated safely.',
      patterns: ['CURRENT_DB_VERSION', 'interface IMigration'],
    },
    {
      id: 'npm-entrypoint',
      title: 'package.json exposes memory compatibility check command',
      files: ['package.json'],
      expected: 'npm run memory:compat-check runs the compatibility checker.',
      patterns: ['"memory:compat-check"'],
    },
    {
      id: 'memory-service-foundation',
      title: 'Memory service foundation still exists',
      files: [
        'src/common/types/memory.ts',
        'src/process/memory/MemoryContextProvider.ts',
        'src/process/memory/MemoryService.ts',
        'src/process/memory/JsonMemoryStore.ts',
        'src/process/memory/MemoryScope.ts',
      ],
      expected: 'MemoryService, JsonMemoryStore, MemoryContextProvider, and scope ID construction remain available.',
      patterns: [
        'export class MemoryService',
        'export class JsonMemoryStore',
        'buildMemoryScopeId',
        'buildPromptContext',
        'buildMemoryAugmentedInput',
      ],
    },
    {
      id: 'memory-ipc-bridge',
      title: 'Memory IPC bridge remains wired',
      files: [
        'src/common/adapter/ipcBridge.ts',
        'src/process/bridge/index.ts',
        'src/process/bridge/memoryBridge.ts',
      ],
      expected: 'Renderer can call memory providers and main process registers initMemoryBridge.',
      patterns: ['memory.ensure-scope', 'memory.upsert-entry', 'initMemoryBridge', 'markAssistantDeleted'],
    },
    {
      id: 'memory-assistant-lifecycle',
      title: 'Assistant lifecycle still creates and preserves memory scopes',
      files: ['src/renderer/hooks/assistant/useAssistantEditor.ts'],
      expected: 'Creating a custom assistant ensures a global memory scope; deleting marks scopes orphaned.',
      patterns: ['memory.ensureScope', 'workspaceId: \'global\'', 'memory.markAssistantDeleted'],
    },
    {
      id: 'memory-workspace-injection',
      title: 'Conversation send path still injects scoped assistant memory',
      files: [
        'src/process/bridge/conversationBridge.ts',
        'src/process/memory/MemoryContextProvider.ts',
        'src/process/task/GeminiAgentManager.ts',
        'src/process/task/AcpAgentManager.ts',
        'src/process/task/NanoBotAgentManager.ts',
        'src/process/task/AionrsManager.ts',
      ],
      expected: 'Memory context is scoped by conversation identity and delivered only to the agent payload.',
      patterns: ['buildMemoryAugmentedInput', 'agentInput', 'agentContent', 'buildPromptContext'],
    },
    {
      id: 'memory-team-scope',
      title: 'Team mode still creates per-agent memory scopes',
      files: ['src/process/team/TeamSessionService.ts'],
      expected: 'Team agents include teamId and assistant identity in their memory scope.',
      patterns: ['ensureTeamAgentMemory', 'teamId', 'assistantId', 'getMemoryService'],
    },
    {
      id: 'memory-settings-ui',
      title: 'Memory settings UI remains reachable and functional',
      files: [
        'src/renderer/components/layout/Router.tsx',
        'src/renderer/pages/settings/components/SettingsSider.tsx',
        'src/renderer/pages/settings/MemorySettings.tsx',
      ],
      expected: 'Settings exposes /settings/memory with list, edit, delete, clear memory actions.',
      patterns: ['/settings/memory', 'MemorySettings', 'memory.listScopes', 'memory.upsertEntry', 'memory.deleteEntry'],
    },
    {
      id: 'assistant-profile-seams',
      title: 'Assistant profile policy seams remain available',
      files: [
        'src/common/types/assistantProfile.ts',
        'src/process/profiles/AssistantProfileService.ts',
        'src/process/profiles/JsonAssistantProfileStore.ts',
      ],
      expected: 'Profiles expose memory/context/evolution/skill policy without moving memory data.',
      patterns: ['AssistantProfile', 'getMemoryPolicy', 'getContextPolicy', 'contextFilesEnabled', 'requireApproval'],
    },
    {
      id: 'agent-context-hooks',
      title: 'Agent context hook bus remains available',
      files: [
        'src/process/hooks/AgentContextHookBus.ts',
        'src/process/memory/MemoryContextProvider.ts',
        'src/process/bridge/conversationBridge.ts',
      ],
      expected: 'Memory/context injection can be extended through hook bus without expanding conversationBridge.',
      patterns: ['AgentContextHookBus', 'beforeMemoryRecall', 'afterMemoryRecall', 'beforeSendToAgent', 'getAgentContextHookBus'],
    },
    {
      id: 'workspace-context-seams',
      title: 'Workspace context files and references remain available',
      files: [
        'src/process/context/ContextFileProvider.ts',
        'src/process/context/ContextReferenceResolver.ts',
        'src/process/memory/MemoryContextProvider.ts',
      ],
      expected: 'Context files and explicit @ references can be loaded under profile policy.',
      patterns: ['ContextFileProvider', 'ContextReferenceResolver', '[AionUi Context]', '@file:', '@diff'],
    },
    {
      id: 'checkpoint-seams',
      title: 'Checkpoint service protects user-owned data changes',
      files: [
        'src/process/checkpoints/CheckpointService.ts',
        'src/process/memory/MemoryService.ts',
        'src/process/profiles/AssistantProfileService.ts',
      ],
      expected: 'Memory/profile changes can snapshot files before mutation.',
      patterns: ['CheckpointService', 'createCheckpoint', 'restoreCheckpoint', 'checkpointService'],
    },
    {
      id: 'skill-manifest-seams',
      title: 'Skill manifest upgrade protection remains available',
      files: ['src/process/skills/SkillManifestService.ts'],
      expected: 'Skill/config files can be protected from overwriting user modifications.',
      patterns: ['SkillManifestService', 'originHash', 'user-modified', 'applyUpdate'],
    },
    {
      id: 'self-evolution-seams',
      title: 'Self-evolution candidate lab remains conservative',
      files: ['src/common/types/selfEvolution.ts', 'src/process/evolution/SelfEvolutionService.ts'],
      expected: 'Self-evolution creates inactive candidates, requires approval, and blocks core source mutation.',
      patterns: ['SelfEvolutionCandidate', 'approveCandidate', 'not-approved', 'core-source-not-allowed'],
    },
  ];
}

function writeReportFiles(reportDir: string, report: MemoryCompatReport): void {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'latest-report.json'), JSON.stringify(report, null, 2), 'utf-8');
  fs.writeFileSync(path.join(reportDir, 'latest-fix-prompt.md'), buildFixPrompt(report), 'utf-8');
}

function buildFixPrompt(report: MemoryCompatReport): string {
  const lines: string[] = [
    '# AionUi Memory Compatibility Fix Prompt',
    '',
    `Checked at: ${report.checkedAt}`,
    `Repository: ${report.repoRoot}`,
    `Status: ${report.ok ? 'PASS' : 'FAIL'}`,
    '',
  ];

  if (report.issues.length === 0) {
    lines.push('No compatibility issues were detected.');
    lines.push('');
    lines.push('If this was run after an upstream AionUi upgrade, proceed with the normal memory module tests.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('Use this report to repair the memory module integration after an upstream AionUi update.');
  lines.push('');

  for (const issue of report.issues) {
    lines.push(`## ${issue.id}`);
    lines.push('');
    lines.push(`Severity: ${issue.severity}`);
    lines.push(`Message: ${issue.message}`);
    lines.push(`Files: ${issue.files.join(', ')}`);
    lines.push(`Expected: ${issue.expected}`);
    lines.push(`Actual: ${issue.actual}`);
    lines.push('');
  }

  lines.push('Repair requirements:');
  lines.push('- Preserve upstream AionUi behavior unless a memory integration seam explicitly needs adjustment.');
  lines.push('- Keep memory data outside core AionUi source files and under the memory module storage path.');
  lines.push('- Re-run `npm run memory:compat-check` after repairs.');

  return `${lines.join('\n')}\n`;
}

export async function runMemoryCompatCheck(options: MemoryCompatCheckOptions = {}): Promise<MemoryCompatReport> {
  const repoRoot = normalizeRoot(options.repoRoot);
  const reportDir = path.resolve(options.reportDir ?? path.join(repoRoot, '.memory', 'reports'));
  const checks: MemoryCompatCheckResult[] = [];
  const issues: MemoryCompatIssue[] = [];

  for (const check of getChecks()) {
    const outcome = runSourceCheck(repoRoot, check);
    checks.push(outcome.result);
    issues.push(...outcome.issues);
  }

  const report: MemoryCompatReport = {
    ok: !issues.some((issue) => issue.severity === 'error'),
    checkedAt: new Date().toISOString(),
    repoRoot,
    checks,
    issues,
  };

  writeReportFiles(reportDir, report);
  return report;
}

async function runCli(): Promise<void> {
  const report = await runMemoryCompatCheck();
  const reportPath = path.join(process.cwd(), '.memory', 'reports', 'latest-report.json');
  const promptPath = path.join(process.cwd(), '.memory', 'reports', 'latest-fix-prompt.md');

  console.log(`Memory compatibility check: ${report.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Checks: ${report.checks.filter((check) => check.ok).length}/${report.checks.length} passed`);
  console.log(`Report: ${reportPath}`);
  console.log(`Fix prompt: ${promptPath}`);

  if (!report.ok) {
    for (const issue of report.issues) {
      console.error(`[${issue.severity}] ${issue.id}: ${issue.message}`);
    }
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
