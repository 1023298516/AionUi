/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { MemoryEntry, MemoryEntryKind, MemoryScope } from '@/common/types/memory';
import { resolveLocaleKey } from '@/common/utils';
import {
  getAssistantSource,
  normalizeExtensionAssistants,
  sortAssistants,
} from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';
import {
  Button,
  Card,
  Empty,
  Input,
  Message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  type TableColumnProps,
} from '@arco-design/web-react';
import { Delete, Edit, Plus, Refresh } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

type EntryFormState = {
  id?: string;
  scopeId?: string;
  kind: MemoryEntryKind;
  content: string;
  tags: string;
};

type AssistantMemorySummary = {
  assistantId: string;
  name: string;
  description: string;
  source: 'builtin' | 'custom' | 'extension' | 'orphaned';
  scopes: MemoryScope[];
  entryCount: number;
  teamCount: number;
  orphaned: boolean;
};

const defaultEntryForm: EntryFormState = {
  kind: 'note',
  content: '',
  tags: '',
};

function formatTime(value: number): string {
  return new Date(value).toLocaleString();
}

function formatTags(tags: string[]): string {
  return tags.join(', ');
}

function parseTags(value: string): string[] {
  return value
    .split(/[,\n，、]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatMemoryCount(count: number): string {
  return `${count} 条记忆`;
}

function formatMemoryScopeCount(count: number): string {
  return `${count} 个记忆区`;
}

function formatTeamCount(count: number): string {
  return `${count} 个团队`;
}

function getAssistantName(assistant: AssistantListItem, localeKey: string): string {
  return assistant.nameI18n?.[localeKey] || assistant.name || assistant.id;
}

function getAssistantDescription(assistant: AssistantListItem, localeKey: string): string {
  return assistant.descriptionI18n?.[localeKey] || assistant.description || '';
}

function getScopeTitle(scope: MemoryScope): string {
  if (scope.teamId) return `团队记忆 · ${scope.teamId}`;
  if (scope.workspaceId === 'global') return '默认记忆区';
  return '工作区记忆';
}

function getScopeDetail(scope: MemoryScope): string {
  const parts = [scope.workspaceId === 'global' ? '范围: 默认（未绑定具体工作区）' : `工作区: ${scope.workspaceId}`];
  if (scope.teamId) parts.push(`团队: ${scope.teamId}`);
  return parts.join(' · ');
}

function getSourceLabel(source: AssistantMemorySummary['source']): string {
  switch (source) {
    case 'builtin':
      return '系统';
    case 'custom':
      return '自定义';
    case 'extension':
      return '扩展';
    case 'orphaned':
      return '已删除';
  }
}

function buildAssistantMemorySummaries(
  assistants: AssistantListItem[],
  scopes: MemoryScope[],
  localeKey: string
): AssistantMemorySummary[] {
  const scopesByAssistant = new Map<string, MemoryScope[]>();
  for (const scope of scopes) {
    const list = scopesByAssistant.get(scope.assistantId) || [];
    list.push(scope);
    scopesByAssistant.set(scope.assistantId, list);
  }

  const rows: AssistantMemorySummary[] = assistants.map((assistant) => {
    const assistantScopes = scopesByAssistant.get(assistant.id) || [];
    const teamIds = new Set(assistantScopes.map((scope) => scope.teamId).filter(Boolean));

    return {
      assistantId: assistant.id,
      name: getAssistantName(assistant, localeKey),
      description: getAssistantDescription(assistant, localeKey),
      source: getAssistantSource(assistant),
      scopes: assistantScopes,
      entryCount: assistantScopes.reduce((total, scope) => total + scope.entryCount, 0),
      teamCount: teamIds.size,
      orphaned: assistantScopes.some((scope) => scope.orphaned),
    };
  });

  const assistantIds = new Set(assistants.map((assistant) => assistant.id));
  for (const [assistantId, assistantScopes] of scopesByAssistant.entries()) {
    if (assistantIds.has(assistantId)) continue;
    const firstScope = assistantScopes[0];
    const teamIds = new Set(assistantScopes.map((scope) => scope.teamId).filter(Boolean));
    rows.push({
      assistantId,
      name: firstScope.assistantName || assistantId,
      description: '该助手已删除，记忆仍保留以便查看或迁移。',
      source: 'orphaned',
      scopes: assistantScopes,
      entryCount: assistantScopes.reduce((total, scope) => total + scope.entryCount, 0),
      teamCount: teamIds.size,
      orphaned: true,
    });
  }

  return rows.toSorted((a, b) => {
    if (b.entryCount !== a.entryCount) return b.entryCount - a.entryCount;
    return a.name.localeCompare(b.name);
  });
}

async function loadAssistants(): Promise<AssistantListItem[]> {
  const localAssistants: AssistantListItem[] = (await ConfigStorage.get('assistants')) || [];
  const extensionAssistants = await ipcBridge.extensions.getAssistants.invoke().catch(() => [] as Record<string, unknown>[]);
  const mergedAssistants = [...localAssistants];

  for (const assistant of normalizeExtensionAssistants(extensionAssistants)) {
    if (!mergedAssistants.some((item) => item.id === assistant.id)) {
      mergedAssistants.push(assistant);
    }
  }

  return sortAssistants(mergedAssistants);
}

const MemorySettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n.language);
  const [assistants, setAssistants] = useState<AssistantListItem[]>([]);
  const [scopes, setScopes] = useState<MemoryScope[]>([]);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState<string>();
  const [selectedScopeId, setSelectedScopeId] = useState<string>();
  const [loadingScopes, setLoadingScopes] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [entryForm, setEntryForm] = useState<EntryFormState>(defaultEntryForm);

  const assistantSummaries = useMemo(
    () => buildAssistantMemorySummaries(assistants, scopes, localeKey),
    [assistants, localeKey, scopes]
  );
  const selectedAssistant = assistantSummaries.find((assistant) => assistant.assistantId === selectedAssistantId);
  const selectedScopes = selectedAssistant?.scopes || [];
  const selectedScope = selectedScopes.find((scope) => scope.id === selectedScopeId);
  const showEntryTable = Boolean(selectedScope && (loadingEntries || entries.length > 0));

  async function refreshMemory(preferredAssistantId?: string, preferredScopeId?: string): Promise<void> {
    setLoadingScopes(true);
    try {
      const [nextAssistants, nextScopes] = await Promise.all([loadAssistants(), ipcBridge.memory.listScopes.invoke()]);
      setAssistants(nextAssistants);
      setScopes(nextScopes);

      const nextSummaries = buildAssistantMemorySummaries(nextAssistants, nextScopes, localeKey);
      const nextAssistantId =
        preferredAssistantId && nextSummaries.some((assistant) => assistant.assistantId === preferredAssistantId)
          ? preferredAssistantId
          : selectedAssistantId && nextSummaries.some((assistant) => assistant.assistantId === selectedAssistantId)
            ? selectedAssistantId
            : nextSummaries[0]?.assistantId;
      const nextAssistant = nextSummaries.find((assistant) => assistant.assistantId === nextAssistantId);
      const nextScopeId =
        preferredScopeId && nextAssistant?.scopes.some((scope) => scope.id === preferredScopeId)
          ? preferredScopeId
          : selectedScopeId && nextAssistant?.scopes.some((scope) => scope.id === selectedScopeId)
            ? selectedScopeId
            : nextAssistant?.scopes[0]?.id;

      setSelectedAssistantId(nextAssistantId);
      setSelectedScopeId(nextScopeId);
    } catch (error) {
      console.error('[MemorySettings] Failed to load memory data:', error);
      Message.error(t('settings.memoryLoadFailed', { defaultValue: '加载记忆失败' }));
    } finally {
      setLoadingScopes(false);
    }
  }

  async function refreshEntries(scopeId?: string): Promise<void> {
    if (!scopeId) {
      setEntries([]);
      return;
    }

    setLoadingEntries(true);
    try {
      setEntries(await ipcBridge.memory.listEntries.invoke({ scopeId }));
    } catch (error) {
      console.error('[MemorySettings] Failed to load memory entries:', error);
      Message.error(t('settings.memoryEntryLoadFailed', { defaultValue: '加载记忆条目失败' }));
    } finally {
      setLoadingEntries(false);
    }
  }

  async function ensureDefaultScopeForSelectedAssistant(): Promise<string | undefined> {
    if (selectedScopeId) return selectedScopeId;
    if (!selectedAssistant) return undefined;

    try {
      const scope = await ipcBridge.memory.ensureScope.invoke({
        userId: 'local',
        workspaceId: 'global',
        assistantId: selectedAssistant.assistantId,
        assistantName: selectedAssistant.name,
      });
      await refreshMemory(selectedAssistant.assistantId, scope.id);
      return scope.id;
    } catch (error) {
      console.error('[MemorySettings] Failed to create memory scope:', error);
      Message.error(t('settings.memoryScopeCreateFailed', { defaultValue: '创建记忆区失败' }));
      return undefined;
    }
  }

  async function openCreateEntryModal(): Promise<void> {
    const scopeId = await ensureDefaultScopeForSelectedAssistant();
    if (!scopeId) return;

    setEntryForm({
      ...defaultEntryForm,
      scopeId,
    });
    setEntryModalVisible(true);
  }

  function openEditEntryModal(entry: MemoryEntry): void {
    setEntryForm({
      id: entry.id,
      scopeId: entry.scopeId,
      kind: entry.kind,
      content: entry.content,
      tags: formatTags(entry.tags),
    });
    setEntryModalVisible(true);
  }

  async function saveEntry(): Promise<void> {
    const scopeId = entryForm.scopeId || selectedScopeId;
    if (!scopeId) return;
    if (!entryForm.content.trim()) {
      Message.warning(t('settings.memoryContentRequired', { defaultValue: '记忆内容不能为空' }));
      return;
    }

    try {
      await ipcBridge.memory.upsertEntry.invoke({
        id: entryForm.id,
        scopeId,
        kind: entryForm.kind,
        content: entryForm.content,
        tags: parseTags(entryForm.tags),
        source: 'settings',
      });
      setEntryModalVisible(false);
      await Promise.all([refreshEntries(scopeId), refreshMemory(selectedAssistantId, scopeId)]);
      Message.success(t('common.saveSuccess', { defaultValue: '保存成功' }));
    } catch (error) {
      console.error('[MemorySettings] Failed to save memory entry:', error);
      Message.error(t('common.failed', { defaultValue: '失败' }));
    }
  }

  async function deleteEntry(entryId: string): Promise<void> {
    if (!selectedScopeId) return;
    try {
      await ipcBridge.memory.deleteEntry.invoke({ scopeId: selectedScopeId, entryId });
      await Promise.all([refreshEntries(selectedScopeId), refreshMemory(selectedAssistantId, selectedScopeId)]);
    } catch (error) {
      console.error('[MemorySettings] Failed to delete memory entry:', error);
      Message.error(t('common.failed', { defaultValue: '失败' }));
    }
  }

  async function clearSelectedScope(): Promise<void> {
    if (!selectedScopeId) return;
    try {
      await ipcBridge.memory.clearScope.invoke({ scopeId: selectedScopeId });
      await Promise.all([refreshEntries(selectedScopeId), refreshMemory(selectedAssistantId, selectedScopeId)]);
    } catch (error) {
      console.error('[MemorySettings] Failed to clear memory scope:', error);
      Message.error(t('common.failed', { defaultValue: '失败' }));
    }
  }

  async function deleteSelectedScope(): Promise<void> {
    if (!selectedScopeId) return;
    try {
      await ipcBridge.memory.deleteScope.invoke({ scopeId: selectedScopeId });
      await refreshMemory(selectedAssistantId);
    } catch (error) {
      console.error('[MemorySettings] Failed to delete memory scope:', error);
      Message.error(t('common.failed', { defaultValue: '失败' }));
    }
  }

  useEffect(() => {
    void refreshMemory();
  }, []);

  useEffect(() => {
    if (assistantSummaries.length === 0) {
      if (selectedAssistantId) setSelectedAssistantId(undefined);
      return;
    }

    if (!selectedAssistantId || !assistantSummaries.some((assistant) => assistant.assistantId === selectedAssistantId)) {
      setSelectedAssistantId(assistantSummaries[0].assistantId);
    }
  }, [assistantSummaries, selectedAssistantId]);

  useEffect(() => {
    if (!selectedAssistant) {
      if (selectedScopeId) setSelectedScopeId(undefined);
      return;
    }

    if (selectedAssistant.scopes.length === 0) {
      if (selectedScopeId) setSelectedScopeId(undefined);
      return;
    }

    if (!selectedScopeId || !selectedAssistant.scopes.some((scope) => scope.id === selectedScopeId)) {
      setSelectedScopeId(selectedAssistant.scopes[0].id);
    }
  }, [selectedAssistant, selectedScopeId]);

  useEffect(() => {
    void refreshEntries(selectedScopeId);
  }, [selectedScopeId]);

  const entryColumns: TableColumnProps<MemoryEntry>[] = [
    {
      title: t('settings.memoryKind', { defaultValue: '类型' }),
      dataIndex: 'kind',
      width: 110,
      render: (kind: MemoryEntryKind) => <Tag color='arcoblue'>{kind}</Tag>,
    },
    {
      title: t('settings.memoryContent', { defaultValue: '内容' }),
      dataIndex: 'content',
      render: (content: string, record: MemoryEntry) => (
        <div>
          <div className='whitespace-pre-wrap text-t-primary'>{content}</div>
          {record.tags.length > 0 && <div className='mt-4px text-12px text-t-tertiary'>{formatTags(record.tags)}</div>}
        </div>
      ),
    },
    {
      title: t('settings.memorySource', { defaultValue: '来源' }),
      dataIndex: 'source',
      width: 110,
      render: (source: string | undefined) => <span className='text-t-secondary'>{source || 'settings'}</span>,
    },
    {
      title: t('settings.memoryUpdatedAt', { defaultValue: '更新时间' }),
      dataIndex: 'updatedAt',
      width: 180,
      render: (updatedAt: number) => <span className='text-t-secondary'>{formatTime(updatedAt)}</span>,
    },
    {
      title: t('common.actions', { defaultValue: '操作' }),
      width: 150,
      render: (_: unknown, record: MemoryEntry) => (
        <Space size='mini'>
          <Button type='text' size='mini' icon={<Edit />} onClick={() => openEditEntryModal(record)}>
            {t('common.edit', { defaultValue: '编辑' })}
          </Button>
          <Popconfirm
            title={t('settings.memoryDeleteEntryConfirm', { defaultValue: '确定删除这条记忆？' })}
            onOk={() => deleteEntry(record.id)}
          >
            <Button type='text' status='danger' size='mini' icon={<Delete />}>
              {t('common.delete', { defaultValue: '删除' })}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <div className='flex flex-col gap-20px'>
        <div>
          <Typography.Title heading={3} className='!m-0'>
            {t('settings.memoryTitle', { defaultValue: '记忆' })}
          </Typography.Title>
          <Typography.Paragraph className='!mt-8px !mb-0 text-t-secondary'>
            {t('settings.memoryDescription', {
              defaultValue: '按助手查看记忆，再按工作区和团队隔离管理。这里只管理用户确认过的记忆，不会自动学习或删除。',
            })}
          </Typography.Paragraph>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-18px'>
          <Card
            title={t('settings.memoryAssistants', { defaultValue: '助手记忆' })}
            extra={
              <Button type='text' size='mini' icon={<Refresh />} loading={loadingScopes} onClick={() => refreshMemory()}>
                {t('common.refresh', { defaultValue: '刷新' })}
              </Button>
            }
            className='min-h-560px !rounded-18px !border-border-2 !shadow-none'
          >
            {assistantSummaries.length === 0 ? (
              <Empty description={t('settings.memoryNoAssistants', { defaultValue: '暂无助手' })} />
            ) : (
              <div className='flex flex-col gap-10px'>
                {assistantSummaries.map((assistant) => {
                  const selected = assistant.assistantId === selectedAssistantId;
                  return (
                    <button
                      key={assistant.assistantId}
                      type='button'
                      data-testid={`memory-assistant-card-${assistant.assistantId}`}
                      className={`text-left border-1 border-solid rd-14px px-14px py-12px transition-all ${
                        selected
                          ? 'border-primary-4 bg-primary-1 shadow-[0_8px_24px_rgba(27,77,255,0.08)]'
                          : 'border-border-2 bg-fill-1 hover:bg-fill-2 hover:border-border-1'
                      }`}
                      onClick={() => {
                        setSelectedAssistantId(assistant.assistantId);
                        setSelectedScopeId(assistant.scopes[0]?.id);
                      }}
                    >
                      <div className='flex items-center justify-between gap-8px'>
                        <span className='font-medium text-t-primary truncate'>{assistant.name}</span>
                        <Tag
                          color={assistant.entryCount > 0 ? 'arcoblue' : 'gray'}
                          className='!rd-999px !px-8px !py-1px'
                        >
                          {formatMemoryCount(assistant.entryCount)}
                        </Tag>
                      </div>
                      {assistant.description && (
                        <div className='mt-6px text-12px leading-18px text-t-secondary line-clamp-2'>{assistant.description}</div>
                      )}
                      <div className='mt-10px flex flex-wrap items-center gap-x-8px gap-y-4px text-12px text-t-tertiary'>
                        <span className='font-medium text-t-secondary'>{getSourceLabel(assistant.source)}</span>
                        <span>{formatMemoryScopeCount(assistant.scopes.length)}</span>
                        <span>{formatTeamCount(assistant.teamCount)}</span>
                        {assistant.orphaned && <span>{t('settings.memoryOrphaned', { defaultValue: '已删除助手' })}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            title={
              selectedAssistant
                ? `${selectedAssistant.name}${selectedScope ? ` · ${getScopeTitle(selectedScope)}` : ''}`
                : t('settings.memoryEntries', { defaultValue: '记忆条目' })
            }
            extra={
              <Space>
                <Button type='primary' icon={<Plus />} disabled={!selectedAssistant} onClick={openCreateEntryModal}>
                  {t('settings.memoryAddEntry', { defaultValue: '新增记忆' })}
                </Button>
                <Popconfirm
                  title={t('settings.memoryClearScopeConfirm', { defaultValue: '确定清空当前记忆区？' })}
                  onOk={clearSelectedScope}
                >
                  <Button disabled={!selectedScopeId || entries.length === 0}>
                    {t('settings.memoryClearScope', { defaultValue: '清空' })}
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title={t('settings.memoryDeleteScopeConfirm', { defaultValue: '确定删除当前记忆区？' })}
                  onOk={deleteSelectedScope}
                >
                  <Button status='danger' disabled={!selectedScopeId}>
                    {t('common.delete', { defaultValue: '删除' })}
                  </Button>
                </Popconfirm>
              </Space>
            }
            className='min-h-560px !rounded-18px !border-border-2 !shadow-none'
          >
            {selectedAssistant ? (
              <div className='flex flex-col gap-14px'>
                {selectedScopes.length > 0 && (
                  <div className='flex flex-wrap gap-8px'>
                    {selectedScopes.map((scope) => (
                      <button
                        key={scope.id}
                        type='button'
                        className={`border-1 border-solid rd-999px px-12px py-6px text-12px transition-colors ${
                          scope.id === selectedScopeId
                            ? 'border-primary-4 bg-primary-1 text-primary'
                            : 'border-border-2 bg-fill-1 text-t-secondary hover:bg-fill-2'
                        }`}
                        onClick={() => setSelectedScopeId(scope.id)}
                      >
                        {getScopeTitle(scope)} · {formatMemoryCount(scope.entryCount)}
                      </button>
                    ))}
                  </div>
                )}

                {selectedScope && <div className='text-12px text-t-tertiary break-all'>{getScopeDetail(selectedScope)}</div>}

                {showEntryTable ? (
                  <Table
                    rowKey='id'
                    loading={loadingEntries}
                    pagination={false}
                    columns={entryColumns}
                    data={entries}
                    noDataElement={<Empty description={t('settings.memoryNoEntries', { defaultValue: '暂无记忆' })} />}
                  />
                ) : (
                  <div className='min-h-300px flex flex-col items-center justify-center rd-18px bg-fill-1 px-24px text-center'>
                    <Empty description={`${selectedAssistant.name}当前没有记忆`} />
                    <Typography.Paragraph className='!mt-8px !mb-0 max-w-420px text-13px leading-20px text-t-tertiary'>
                      {selectedScope
                        ? t('settings.memoryEmptyScopeHint', {
                            defaultValue: '当前记忆区还没有内容。新增后，这些记忆只会用于这个助手和当前记忆区范围。',
                          })
                        : t('settings.memoryEmptyAssistantHint', {
                            defaultValue: '这个助手还没有记忆区。新增第一条记忆时会自动创建默认记忆区，后续仍可按工作区和团队隔离。',
                          })}
                    </Typography.Paragraph>
                    <Button type='primary' className='!mt-18px' icon={<Plus />} onClick={openCreateEntryModal}>
                      {t('settings.memoryAddFirstEntry', { defaultValue: '新增第一条记忆' })}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Empty description={t('settings.memorySelectAssistant', { defaultValue: '请选择助手' })} />
            )}
          </Card>
        </div>
      </div>

      <Modal
        title={
          entryForm.id
            ? t('settings.memoryEditEntry', { defaultValue: '编辑记忆' })
            : t('settings.memoryAddEntry', { defaultValue: '新增记忆' })
        }
        visible={entryModalVisible}
        onCancel={() => setEntryModalVisible(false)}
        onOk={saveEntry}
      >
        <div className='flex flex-col gap-12px'>
          <Select
            value={entryForm.kind}
            onChange={(kind) => setEntryForm((prev) => ({ ...prev, kind: kind as MemoryEntryKind }))}
            placeholder={t('settings.memoryKind', { defaultValue: '类型' })}
          >
            <Select.Option value='fact'>{t('settings.memoryKindFact', { defaultValue: '事实' })}</Select.Option>
            <Select.Option value='preference'>{t('settings.memoryKindPreference', { defaultValue: '偏好' })}</Select.Option>
            <Select.Option value='note'>{t('settings.memoryKindNote', { defaultValue: '备注' })}</Select.Option>
          </Select>
          <Input.TextArea
            value={entryForm.content}
            onChange={(content) => setEntryForm((prev) => ({ ...prev, content }))}
            autoSize={{ minRows: 5, maxRows: 10 }}
            placeholder={t('settings.memoryContentPlaceholder', { defaultValue: '输入这条助手记忆...' })}
          />
          <Input
            value={entryForm.tags}
            onChange={(tags) => setEntryForm((prev) => ({ ...prev, tags }))}
            placeholder={t('settings.memoryTagsPlaceholder', { defaultValue: '标签，用逗号分隔' })}
          />
        </div>
      </Modal>
    </SettingsPageWrapper>
  );
};

export default MemorySettings;
