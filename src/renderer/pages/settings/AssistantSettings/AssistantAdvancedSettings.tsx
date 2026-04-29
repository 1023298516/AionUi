/**
 * Assistant-scoped advanced controls for memory, context, skills, and self-evolution.
 */
import { ipcBridge } from '@/common';
import type {
  AssistantAdvancedCheckpointSummary,
  AssistantAdvancedContextFileStatus,
  AssistantAdvancedOverview,
  AssistantAdvancedSkillFileStatus,
} from '@/common/types/assistantAdvanced';
import type { AssistantProfile, UpdateAssistantProfileParams } from '@/common/types/assistantProfile';
import type {
  SelfEvolutionCandidate,
  SelfEvolutionCandidateStatus,
  SelfEvolutionCandidateType,
} from '@/common/types/selfEvolution';
import {
  Button,
  Checkbox,
  Collapse,
  Empty,
  Input,
  InputNumber,
  Message,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { Experiment, History, Link, Memory, Protect, Refresh, Setting } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type AssistantAdvancedSettingsProps = {
  assistantId: string;
  assistantName?: string;
  disabled?: boolean;
};

type CandidateFilter = SelfEvolutionCandidateStatus | 'all';

const DEFAULT_ALLOWED_CONTEXT_FILES = ['.aionui.md', 'AGENTS.md', 'SOUL.md', 'memory.rules.md'];
const REFERENCES = ['@memory', '@workspace-memory', '@file:<relative-path>', '@diff'];
const CANDIDATE_FILTERS: CandidateFilter[] = ['all', 'candidate', 'approved', 'applied', 'rejected'];
const CANDIDATE_TYPES: SelfEvolutionCandidateType[] = ['profile-policy', 'memory-rule', 'skill'];

function formatTime(value: number): string {
  return new Date(value).toLocaleString();
}

function formatAllowedFiles(files: string[]): string {
  return files.join('\n');
}

function parseAllowedFiles(value: string): string[] {
  return value
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateAllowedContextFile(fileName: string): AssistantAdvancedContextFileStatus {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return { fileName, valid: false, reason: 'empty' };
  }
  if (/^(?:[a-zA-Z]:[\\/]|[\\/])/.test(trimmed)) {
    return { fileName: trimmed, valid: false, reason: 'absolute' };
  }
  if (trimmed.includes('..')) {
    return { fileName: trimmed, valid: false, reason: 'parent-reference' };
  }
  if (/[\\/]/.test(trimmed)) {
    return { fileName: trimmed, valid: false, reason: 'nested' };
  }
  return { fileName: trimmed, valid: true };
}

function candidateColor(status: SelfEvolutionCandidate['status']): 'gray' | 'arcoblue' | 'green' | 'red' {
  switch (status) {
    case 'approved':
      return 'arcoblue';
    case 'applied':
      return 'green';
    case 'rejected':
      return 'red';
    case 'candidate':
    default:
      return 'gray';
  }
}

function skillStatusColor(status: AssistantAdvancedSkillFileStatus['state']): 'green' | 'red' | 'orange' | 'gray' {
  switch (status) {
    case 'unchanged':
      return 'green';
    case 'user-modified':
      return 'orange';
    case 'missing':
      return 'red';
    case 'untracked':
    default:
      return 'gray';
  }
}

function checkpointNamespaces(checkpoints: AssistantAdvancedCheckpointSummary[]): string[] {
  return Array.from(new Set(checkpoints.map((checkpoint) => checkpoint.namespace))).sort();
}

const AssistantAdvancedSettings: React.FC<AssistantAdvancedSettingsProps> = ({
  assistantId,
  assistantName,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AssistantAdvancedOverview | null>(null);
  const [allowedFilesDraft, setAllowedFilesDraft] = useState('');
  const [allowedFilesError, setAllowedFilesError] = useState<string | null>(null);
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>('all');
  const [checkpointNamespace, setCheckpointNamespace] = useState('all');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [candidateFormVisible, setCandidateFormVisible] = useState(false);
  const [candidateType, setCandidateType] = useState<SelfEvolutionCandidateType>('profile-policy');
  const [candidateTitle, setCandidateTitle] = useState('');
  const [candidateContent, setCandidateContent] = useState('');
  const [candidateTargetPath, setCandidateTargetPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const profile = overview?.profile ?? null;
  const candidates = overview?.candidates ?? [];
  const checkpoints = overview?.checkpoints ?? [];
  const skillFiles = overview?.skillFiles ?? [];
  const contextFileStatuses = overview?.contextFileStatuses ?? [];
  const memoryPreview = overview?.memoryPreview ?? {
    scopeId: '',
    scopeCount: 0,
    entryCount: 0,
    memoryContext: '',
  };
  const filteredCandidates = candidates.filter((candidate) => candidateFilter === 'all' || candidate.status === candidateFilter);
  const filteredCheckpoints = checkpoints.filter(
    (checkpoint) => checkpointNamespace === 'all' || checkpoint.namespace === checkpointNamespace
  );
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId);
  const selectedCheckpoint = checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const nextOverview = await ipcBridge.assistantAdvanced.getOverview.invoke({ assistantId, assistantName });
      setOverview(nextOverview);
      setAllowedFilesDraft(formatAllowedFiles(nextOverview.profile.context.allowedContextFiles));
      setAllowedFilesError(null);
    } catch (error) {
      console.error('[AssistantAdvancedSettings] Failed to load overview:', error);
      Message.error(t('settings.assistantAdvancedLoadFailed', { defaultValue: '加载高级设置失败' }));
    } finally {
      setLoading(false);
    }
  }, [assistantId, assistantName, t]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function saveProfile(updates: UpdateAssistantProfileParams): Promise<void> {
    setSaving(true);
    try {
      const updated = await ipcBridge.assistantAdvanced.updateProfile.invoke({ assistantId, updates });
      setOverview((current) =>
        current
          ? {
              ...current,
              profile: updated,
              contextFileStatuses: updated.context.allowedContextFiles.map(validateAllowedContextFile),
            }
          : current
      );
      setAllowedFilesDraft(formatAllowedFiles(updated.context.allowedContextFiles));
      setAllowedFilesError(null);
      Message.success(t('common.saveSuccess', { defaultValue: '保存成功' }));
    } catch (error) {
      console.error('[AssistantAdvancedSettings] Failed to save profile:', error);
      Message.error(t('common.failed', { defaultValue: '失败' }));
    } finally {
      setSaving(false);
    }
  }

  async function refreshMemoryPreview(): Promise<void> {
    if (!profile) return;
    const nextPreview = await ipcBridge.assistantAdvanced.getMemoryPreview.invoke({
      assistantId,
      assistantName,
      maxPromptEntries: profile.memory.maxPromptEntries,
    });
    setOverview((current) => (current ? { ...current, memoryPreview: nextPreview } : current));
  }

  async function ensureMemoryScope(): Promise<void> {
    if (!profile) return;
    const nextPreview = await ipcBridge.assistantAdvanced.ensureMemoryScope.invoke({
      assistantId,
      assistantName,
      maxPromptEntries: profile.memory.maxPromptEntries,
    });
    setOverview((current) => (current ? { ...current, memoryPreview: nextPreview } : current));
    Message.success(t('settings.memoryScopeEnsured', { defaultValue: '记忆区已创建或已存在' }));
  }

  function saveAllowedFiles(): void {
    if (!profile) return;
    const nextFiles = parseAllowedFiles(allowedFilesDraft);
    const invalid = nextFiles.map(validateAllowedContextFile).find((status) => !status.valid);
    if (invalid) {
      setAllowedFilesError(`Unsafe context file entry: ${invalid.fileName}`);
      return;
    }
    void saveProfile({
      context: {
        ...profile.context,
        allowedContextFiles: nextFiles,
      },
    });
  }

  async function approveCandidate(id: string): Promise<void> {
    await ipcBridge.assistantAdvanced.approveCandidate.invoke({ id });
    await loadOverview();
  }

  async function applyCandidate(id: string): Promise<void> {
    const result = await ipcBridge.assistantAdvanced.applyCandidate.invoke({ id });
    if (result.applied === false) {
      Message.warning(result.reason);
    }
    await loadOverview();
  }

  async function rejectCandidate(id: string): Promise<void> {
    await ipcBridge.assistantAdvanced.rejectCandidate.invoke({ id });
    await loadOverview();
  }

  async function createCandidate(): Promise<void> {
    const title = candidateTitle.trim();
    const content = candidateContent.trim();
    const targetPath = candidateTargetPath.trim() || undefined;
    if (!title || !content) {
      Message.warning(t('settings.candidateRequired', { defaultValue: '候选标题和内容不能为空' }));
      return;
    }
    await ipcBridge.assistantAdvanced.createCandidate.invoke({
      assistantId,
      type: candidateType,
      title,
      content,
      targetPath,
    });
    setCandidateTitle('');
    setCandidateContent('');
    setCandidateTargetPath('');
    setCandidateFormVisible(false);
    await loadOverview();
  }

  async function restoreCheckpoint(id: string): Promise<void> {
    await ipcBridge.assistantAdvanced.restoreCheckpoint.invoke({ id });
    await loadOverview();
  }

  if (loading && !profile) {
    return (
      <div className='flex items-center justify-center py-24px bg-fill-1 rd-12px'>
        <Spin />
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className='flex-shrink-0' data-testid='assistant-advanced-settings'>
      <div className='flex items-center justify-between mb-10px'>
        <Typography.Text bold className='flex items-center gap-6px'>
          <Setting size={16} />
          {t('settings.assistantAdvanced', { defaultValue: 'Advanced' })}
        </Typography.Text>
        <Button
          data-testid='assistant-advanced-refresh'
          type='text'
          size='mini'
          icon={<Refresh />}
          loading={loading}
          onClick={() => void loadOverview()}
        >
          {t('common.refresh', { defaultValue: '刷新' })}
        </Button>
      </div>

      <Collapse defaultActiveKey={['memory-policy']} className='bg-bg-1'>
        <Collapse.Item
          name='memory-policy'
          header={
            <span className='flex items-center gap-6px text-13px font-medium' data-testid='assistant-advanced-memory-header'>
              <Memory size={15} />
              {t('settings.assistantMemoryPolicy', { defaultValue: '记忆策略' })}
            </span>
          }
        >
          <div className='flex flex-col gap-12px'>
            <Checkbox
              aria-label='Enable assistant memory'
              role='checkbox'
              aria-checked={profile.memory.enabled}
              checked={profile.memory.enabled}
              disabled={disabled || saving}
              onChange={(checked) =>
                void saveProfile({ memory: { ...profile.memory, enabled: Boolean(checked) } })
              }
            >
              {t('settings.assistantMemoryEnabled', { defaultValue: '启用这个助手的记忆' })}
            </Checkbox>

            <div className='flex items-center gap-10px'>
              <span className='text-12px text-t-secondary'>
                {t('settings.assistantMemoryMaxEntries', { defaultValue: '最多注入条数' })}
              </span>
              <InputNumber
                min={1}
                max={100}
                size='small'
                value={profile.memory.maxPromptEntries}
                disabled={disabled || saving}
                onChange={(value) => {
                  const nextValue = typeof value === 'number' ? value : Number(value);
                  if (Number.isFinite(nextValue)) {
                    void saveProfile({ memory: { ...profile.memory, maxPromptEntries: nextValue } });
                  }
                }}
              />
            </div>

            <div className='rd-12px bg-fill-1 px-12px py-10px'>
              <div className='flex items-center justify-between gap-8px'>
                <div data-testid='assistant-memory-preview-stats' className='text-12px text-t-secondary'>
                  Scopes {memoryPreview.scopeCount} · Entries {memoryPreview.entryCount}
                </div>
                <Space size='mini'>
                  <Button size='mini' onClick={() => void refreshMemoryPreview()}>
                    {t('settings.refreshMemoryPreview', { defaultValue: '刷新预览' })}
                  </Button>
                  <Button size='mini' type='outline' onClick={() => void ensureMemoryScope()}>
                    {t('settings.ensureMemoryScope', { defaultValue: '创建默认记忆区' })}
                  </Button>
                </Space>
              </div>
              <pre className='mt-8px max-h-120px overflow-auto whitespace-pre-wrap rd-8px bg-bg-2 px-10px py-8px text-12px text-t-secondary'>
                {memoryPreview.memoryContext || t('settings.emptyMemoryPreview', { defaultValue: '当前没有可注入的记忆预览' })}
              </pre>
            </div>

            <div className='flex items-center justify-between rd-10px bg-fill-1 px-12px py-10px'>
              <span className='text-12px text-t-secondary'>
                {t('settings.assistantMemoryManageHint', {
                  defaultValue: '具体记忆仍在 Memory 页按助手、工作区、团队管理。',
                })}
              </span>
              <Button type='outline' size='mini' onClick={() => navigate('/settings/memory', { replace: true })}>
                {t('settings.openMemoryPage', { defaultValue: '打开 Memory' })}
              </Button>
            </div>
          </div>
        </Collapse.Item>

        <Collapse.Item
          name='context'
          header={
            <span className='flex items-center gap-6px text-13px font-medium' data-testid='assistant-advanced-context-header'>
              <Link size={15} />
              {t('settings.assistantContextPolicy', { defaultValue: '上下文' })}
            </span>
          }
        >
          <div className='flex flex-col gap-12px'>
            <Checkbox
              aria-label='Enable context files'
              role='checkbox'
              aria-checked={profile.context.contextFilesEnabled}
              checked={profile.context.contextFilesEnabled}
              disabled={disabled || saving}
              onChange={(checked) =>
                void saveProfile({ context: { ...profile.context, contextFilesEnabled: Boolean(checked) } })
              }
            >
              {t('settings.assistantContextFilesEnabled', { defaultValue: '启用工作区上下文文件' })}
            </Checkbox>

            <Checkbox
              aria-label='Enable @ references'
              role='checkbox'
              aria-checked={profile.context.referencesEnabled}
              checked={profile.context.referencesEnabled}
              disabled={disabled || saving}
              onChange={(checked) =>
                void saveProfile({ context: { ...profile.context, referencesEnabled: Boolean(checked) } })
              }
            >
              {t('settings.assistantReferencesEnabled', { defaultValue: '启用 @memory / @file / @diff 引用' })}
            </Checkbox>

            <div>
              <div className='mb-6px flex items-center justify-between gap-8px'>
                <span className='text-12px text-t-secondary'>
                  {t('settings.assistantAllowedContextFiles', { defaultValue: '允许的根目录上下文文件' })}
                </span>
                <Button
                  size='mini'
                  type='text'
                  disabled={disabled || saving}
                  onClick={() =>
                    void saveProfile({
                      context: {
                        ...profile.context,
                        allowedContextFiles: DEFAULT_ALLOWED_CONTEXT_FILES,
                      },
                    })
                  }
                >
                  Restore default context whitelist
                </Button>
              </div>
              <Input.TextArea
                aria-label='Allowed context files'
                value={allowedFilesDraft}
                disabled={disabled || saving}
                rows={3}
                onChange={setAllowedFilesDraft}
                onBlur={saveAllowedFiles}
              />
              {allowedFilesError ? <div className='mt-6px text-12px text-danger'>{allowedFilesError}</div> : null}
              <div className='mt-8px flex flex-wrap gap-6px'>
                {contextFileStatuses.map((file) => (
                  <Tag key={file.fileName} color={file.valid ? 'arcoblue' : 'red'}>
                    {file.fileName}
                  </Tag>
                ))}
              </div>
            </div>

            <div className='flex flex-wrap gap-6px text-12px text-t-tertiary'>
              {REFERENCES.map((reference) => (
                <Tag key={reference} color='gray'>
                  {reference}
                </Tag>
              ))}
            </div>
          </div>
        </Collapse.Item>

        <Collapse.Item
          name='skill-protection'
          header={
            <span className='flex items-center gap-6px text-13px font-medium' data-testid='assistant-advanced-skill-header'>
              <Protect size={15} />
              {t('settings.assistantSkillProtection', { defaultValue: '技能保护' })}
            </span>
          }
        >
          <div className='flex flex-col gap-12px'>
            <Checkbox
              checked={profile.skills.manifestProtectionEnabled}
              disabled={disabled || saving}
              onChange={(checked) =>
                void saveProfile({ skills: { ...profile.skills, manifestProtectionEnabled: Boolean(checked) } })
              }
            >
              {t('settings.assistantSkillManifestEnabled', {
                defaultValue: '启用 Skill Manifest 保护，用户改过的技能不会被托管更新覆盖。',
              })}
            </Checkbox>
            {skillFiles.length === 0 ? (
              <Empty description={t('settings.noSkillFiles', { defaultValue: '暂无被 Manifest 跟踪的技能文件' })} />
            ) : (
              <div className='flex flex-col gap-8px'>
                {skillFiles.map((file) => (
                  <div key={file.filePath} className='rd-10px bg-fill-1 px-12px py-10px'>
                    <div className='flex items-center justify-between gap-8px'>
                      <span className='truncate text-12px text-t-secondary'>{file.filePath}</span>
                      <Tag color={skillStatusColor(file.state)}>{file.state}</Tag>
                    </div>
                    {file.owner ? <div className='mt-4px text-12px text-t-tertiary'>Owner: {file.owner}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Collapse.Item>

        <Collapse.Item
          name='self-evolution'
          header={
            <span className='flex items-center gap-6px text-13px font-medium' data-testid='assistant-advanced-evolution-header'>
              <Experiment size={15} />
              {t('settings.assistantSelfEvolution', { defaultValue: '自进化实验室' })}
            </span>
          }
        >
          <div className='flex flex-col gap-12px'>
            <Checkbox
              checked={profile.evolution.enabled}
              disabled={disabled || saving}
              onChange={(checked) =>
                void saveProfile({ evolution: { ...profile.evolution, enabled: Boolean(checked) } })
              }
            >
              {t('settings.assistantEvolutionEnabled', { defaultValue: '允许生成自进化候选' })}
            </Checkbox>
            <Checkbox
              checked={profile.evolution.requireApproval}
              disabled={disabled || saving}
              onChange={(checked) =>
                void saveProfile({ evolution: { ...profile.evolution, requireApproval: Boolean(checked) } })
              }
            >
              {t('settings.assistantEvolutionRequireApproval', { defaultValue: '应用前必须人工批准' })}
            </Checkbox>

            <div className='flex items-center justify-between gap-8px'>
              <Space size='mini' wrap>
                {CANDIDATE_FILTERS.map((status) => (
                  <Button
                    key={status}
                    size='mini'
                    type={candidateFilter === status ? 'primary' : 'secondary'}
                    onClick={() => setCandidateFilter(status)}
                  >
                    {status}
                  </Button>
                ))}
              </Space>
              <Button size='mini' type='outline' onClick={() => setCandidateFormVisible((visible) => !visible)}>
                Create evolution candidate
              </Button>
            </div>

            {candidateFormVisible ? (
              <div className='flex flex-col gap-8px rd-12px bg-fill-1 px-12px py-10px'>
                <div className='flex flex-wrap gap-6px'>
                  {CANDIDATE_TYPES.map((type) => (
                    <Button
                      key={type}
                      size='mini'
                      type={candidateType === type ? 'primary' : 'secondary'}
                      onClick={() => setCandidateType(type)}
                    >
                      {type}
                    </Button>
                  ))}
                </div>
                <Input
                  aria-label='Candidate title'
                  placeholder={t('settings.candidateTitle', { defaultValue: '候选标题' })}
                  value={candidateTitle}
                  onChange={setCandidateTitle}
                />
                <Input
                  aria-label='Candidate target path'
                  placeholder={t('settings.candidateTargetPath', { defaultValue: '目标文件路径，可选' })}
                  value={candidateTargetPath}
                  onChange={setCandidateTargetPath}
                />
                <Input.TextArea
                  aria-label='Candidate content'
                  placeholder={t('settings.candidateContent', { defaultValue: '候选内容' })}
                  value={candidateContent}
                  rows={3}
                  onChange={setCandidateContent}
                />
                <Button size='mini' type='primary' onClick={() => void createCandidate()}>
                  Save candidate
                </Button>
              </div>
            ) : null}

            {filteredCandidates.length === 0 ? (
              <Empty description={t('settings.noSelfEvolutionCandidates', { defaultValue: 'No self-evolution candidates' })} />
            ) : (
              <div className='flex flex-col gap-8px'>
                {filteredCandidates.map((candidate) => (
                  <div key={candidate.id} className='rd-10px bg-fill-1 px-12px py-10px'>
                    <div className='flex items-center justify-between gap-8px'>
                      <div className='min-w-0'>
                        <div className='flex items-center gap-6px'>
                          <span className='font-medium text-t-primary truncate'>{candidate.title}</span>
                          <Tag color={candidateColor(candidate.status)}>{candidate.status}</Tag>
                        </div>
                        <div className='mt-4px text-12px text-t-secondary'>{candidate.type}</div>
                      </div>
                      <Space size='mini'>
                        <Button
                          aria-label={`View candidate ${candidate.id}`}
                          size='mini'
                          onClick={() => setSelectedCandidateId(candidate.id)}
                        >
                          {t('common.view', { defaultValue: '查看' })}
                        </Button>
                        <Button
                          size='mini'
                          disabled={candidate.status !== 'candidate'}
                          onClick={() => void approveCandidate(candidate.id)}
                        >
                          {t('common.approve', { defaultValue: '批准' })}
                        </Button>
                        <Popconfirm
                          title={t('settings.applyCandidateConfirm', { defaultValue: '确定应用这个候选？' })}
                          onOk={() => applyCandidate(candidate.id)}
                        >
                          <Button size='mini' type='primary' disabled={candidate.status !== 'approved'}>
                            {t('common.apply', { defaultValue: '应用' })}
                          </Button>
                        </Popconfirm>
                        <Popconfirm
                          title={t('settings.rejectCandidateConfirm', { defaultValue: '确定拒绝这个候选？' })}
                          onOk={() => rejectCandidate(candidate.id)}
                        >
                          <Button size='mini' status='danger' disabled={candidate.status === 'applied'}>
                            {t('common.reject', { defaultValue: '拒绝' })}
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedCandidate ? (
              <div className='rd-12px bg-bg-2 px-12px py-10px'>
                <div className='font-medium'>{selectedCandidate.title}</div>
                <div className='mt-4px text-12px text-t-secondary'>
                  {selectedCandidate.type} · {selectedCandidate.status}
                </div>
                {selectedCandidate.targetPath ? (
                  <div className='mt-4px text-12px text-t-tertiary'>{selectedCandidate.targetPath}</div>
                ) : null}
                <pre className='mt-8px whitespace-pre-wrap text-12px text-t-secondary'>{selectedCandidate.content}</pre>
              </div>
            ) : null}
          </div>
        </Collapse.Item>

        <Collapse.Item
          name='checkpoints'
          header={
            <span className='flex items-center gap-6px text-13px font-medium' data-testid='assistant-advanced-checkpoints-header'>
              <History size={15} />
              {t('settings.assistantCheckpoints', { defaultValue: '保护点' })}
            </span>
          }
        >
          <div className='flex flex-col gap-12px'>
            <Space size='mini' wrap>
              <Button
                size='mini'
                type={checkpointNamespace === 'all' ? 'primary' : 'secondary'}
                onClick={() => setCheckpointNamespace('all')}
              >
                all
              </Button>
              {checkpointNamespaces(checkpoints).map((namespace) => (
                <Button
                  key={namespace}
                  size='mini'
                  type={checkpointNamespace === namespace ? 'primary' : 'secondary'}
                  onClick={() => setCheckpointNamespace(namespace)}
                >
                  {namespace}
                </Button>
              ))}
            </Space>

            {filteredCheckpoints.length === 0 ? (
              <Empty description={t('settings.noCheckpoints', { defaultValue: '暂无保护点' })} />
            ) : (
              <div className='flex flex-col gap-8px'>
                {filteredCheckpoints.slice(0, 8).map((checkpoint) => (
                  <div key={checkpoint.id} className='flex items-center justify-between gap-10px rd-10px bg-fill-1 px-12px py-10px'>
                    <div className='min-w-0'>
                      <div className='text-13px text-t-primary truncate'>{checkpoint.reason}</div>
                      <div className='mt-4px text-12px text-t-tertiary truncate'>
                        {checkpoint.namespace} · {formatTime(checkpoint.createdAt)}
                      </div>
                    </div>
                    <Space size='mini'>
                      <Button
                        aria-label={`View checkpoint ${checkpoint.id}`}
                        size='mini'
                        onClick={() => setSelectedCheckpointId(checkpoint.id)}
                      >
                        {t('common.view', { defaultValue: '查看' })}
                      </Button>
                      <Popconfirm
                        title={t('settings.restoreCheckpointConfirm', { defaultValue: '确定恢复这个保护点？' })}
                        onOk={() => restoreCheckpoint(checkpoint.id)}
                      >
                        <Button size='mini'>{t('common.restore', { defaultValue: '恢复' })}</Button>
                      </Popconfirm>
                    </Space>
                  </div>
                ))}
              </div>
            )}

            {selectedCheckpoint ? (
              <div className='rd-12px bg-bg-2 px-12px py-10px text-12px text-t-secondary'>
                <div className='font-medium text-t-primary'>{selectedCheckpoint.reason}</div>
                <div className='mt-6px'>Namespace: {selectedCheckpoint.namespace}</div>
                <div className='mt-4px break-all'>Target: {selectedCheckpoint.targetPath}</div>
                <div className='mt-4px'>Size: {selectedCheckpoint.contentLength} bytes</div>
                <div className='mt-4px'>{selectedCheckpoint.existed ? 'file existed' : 'file did not exist'}</div>
              </div>
            ) : null}
          </div>
        </Collapse.Item>
      </Collapse>
    </div>
  );
};

export default AssistantAdvancedSettings;
