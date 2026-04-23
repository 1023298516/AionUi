/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { MemoryEntry, MemoryEntryKind, MemoryScope } from '@/common/types/memory';
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
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

type EntryFormState = {
  id?: string;
  kind: MemoryEntryKind;
  content: string;
  tags: string;
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
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

const MemorySettings: React.FC = () => {
  const { t } = useTranslation();
  const [scopes, setScopes] = useState<MemoryScope[]>([]);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [selectedScopeId, setSelectedScopeId] = useState<string>();
  const [loadingScopes, setLoadingScopes] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [entryForm, setEntryForm] = useState<EntryFormState>(defaultEntryForm);

  const selectedScope = scopes.find((scope) => scope.id === selectedScopeId);

  async function refreshScopes(preferredScopeId?: string): Promise<void> {
    setLoadingScopes(true);
    try {
      const nextScopes = await ipcBridge.memory.listScopes.invoke();
      setScopes(nextScopes);
      const nextSelectedId =
        preferredScopeId && nextScopes.some((scope) => scope.id === preferredScopeId)
          ? preferredScopeId
          : selectedScopeId && nextScopes.some((scope) => scope.id === selectedScopeId)
            ? selectedScopeId
            : nextScopes[0]?.id;
      setSelectedScopeId(nextSelectedId);
    } catch (error) {
      console.error('[MemorySettings] Failed to load memory scopes:', error);
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

  function openCreateEntryModal(): void {
    setEntryForm(defaultEntryForm);
    setEntryModalVisible(true);
  }

  function openEditEntryModal(entry: MemoryEntry): void {
    setEntryForm({
      id: entry.id,
      kind: entry.kind,
      content: entry.content,
      tags: formatTags(entry.tags),
    });
    setEntryModalVisible(true);
  }

  async function saveEntry(): Promise<void> {
    if (!selectedScopeId) return;
    if (!entryForm.content.trim()) {
      Message.warning(t('settings.memoryContentRequired', { defaultValue: '记忆内容不能为空' }));
      return;
    }

    try {
      await ipcBridge.memory.upsertEntry.invoke({
        id: entryForm.id,
        scopeId: selectedScopeId,
        kind: entryForm.kind,
        content: entryForm.content,
        tags: parseTags(entryForm.tags),
        source: 'settings',
      });
      setEntryModalVisible(false);
      await Promise.all([refreshEntries(selectedScopeId), refreshScopes(selectedScopeId)]);
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
      await Promise.all([refreshEntries(selectedScopeId), refreshScopes(selectedScopeId)]);
    } catch (error) {
      console.error('[MemorySettings] Failed to delete memory entry:', error);
      Message.error(t('common.failed', { defaultValue: '失败' }));
    }
  }

  async function clearSelectedScope(): Promise<void> {
    if (!selectedScopeId) return;
    try {
      await ipcBridge.memory.clearScope.invoke({ scopeId: selectedScopeId });
      await Promise.all([refreshEntries(selectedScopeId), refreshScopes(selectedScopeId)]);
    } catch (error) {
      console.error('[MemorySettings] Failed to clear memory scope:', error);
      Message.error(t('common.failed', { defaultValue: '失败' }));
    }
  }

  async function deleteSelectedScope(): Promise<void> {
    if (!selectedScopeId) return;
    try {
      await ipcBridge.memory.deleteScope.invoke({ scopeId: selectedScopeId });
      await refreshScopes();
    } catch (error) {
      console.error('[MemorySettings] Failed to delete memory scope:', error);
      Message.error(t('common.failed', { defaultValue: '失败' }));
    }
  }

  useEffect(() => {
    void refreshScopes();
  }, []);

  useEffect(() => {
    void refreshEntries(selectedScopeId);
  }, [selectedScopeId]);

  const entryColumns: TableColumnProps<MemoryEntry>[] = [
    {
      title: t('settings.memoryKind', { defaultValue: '类型' }),
      dataIndex: 'kind',
      width: 120,
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
              defaultValue: '每个助手按工作区和团队隔离记忆。这里只管理用户确认过的记忆，不会自动学习或删除。',
            })}
          </Typography.Paragraph>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-16px'>
          <Card
            title={t('settings.memoryScopes', { defaultValue: '记忆区' })}
            extra={
              <Button type='text' size='mini' icon={<Refresh />} loading={loadingScopes} onClick={() => refreshScopes()}>
                {t('common.refresh', { defaultValue: '刷新' })}
              </Button>
            }
            className='min-h-460px'
          >
            {scopes.length === 0 ? (
              <Empty description={t('settings.memoryNoScopes', { defaultValue: '暂无记忆区' })} />
            ) : (
              <div className='flex flex-col gap-8px'>
                {scopes.map((scope) => {
                  const selected = scope.id === selectedScopeId;
                  return (
                    <button
                      key={scope.id}
                      type='button'
                      className={`text-left border rd-10px px-12px py-10px bg-fill-1 hover:bg-fill-2 transition-colors ${
                        selected ? 'border-primary-6' : 'border-border-1'
                      }`}
                      onClick={() => setSelectedScopeId(scope.id)}
                    >
                      <div className='flex items-center justify-between gap-8px'>
                        <span className='font-medium text-t-primary truncate'>
                          {scope.assistantName || scope.assistantId}
                        </span>
                        <Tag color={scope.orphaned ? 'orange' : 'green'}>
                          {scope.orphaned
                            ? t('settings.memoryOrphaned', { defaultValue: '已删除助手' })
                            : `${scope.entryCount}`}
                        </Tag>
                      </div>
                      <div className='mt-6px text-12px text-t-tertiary break-all'>{scope.workspaceId}</div>
                      {scope.teamId && <div className='mt-4px text-12px text-t-tertiary'>Team: {scope.teamId}</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            title={selectedScope?.assistantName || selectedScope?.assistantId || t('settings.memoryEntries', { defaultValue: '记忆条目' })}
            extra={
              <Space>
                <Button type='primary' icon={<Plus />} disabled={!selectedScopeId} onClick={openCreateEntryModal}>
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
            className='min-h-460px'
          >
            {selectedScope ? (
              <Table
                rowKey='id'
                loading={loadingEntries}
                pagination={false}
                columns={entryColumns}
                data={entries}
                noDataElement={<Empty description={t('settings.memoryNoEntries', { defaultValue: '暂无记忆' })} />}
              />
            ) : (
              <Empty description={t('settings.memorySelectScope', { defaultValue: '请选择记忆区' })} />
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
