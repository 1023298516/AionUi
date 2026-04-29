import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEntry, MemoryScope } from '@/common/types/memory';

const mockListScopes = vi.fn();
const mockListEntries = vi.fn();
const mockEnsureScope = vi.fn();
const mockUpsertEntry = vi.fn();
const mockDeleteEntry = vi.fn();
const mockClearScope = vi.fn();
const mockDeleteScope = vi.fn();
const mockGetAssistants = vi.fn();
const mockConfigGet = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Delete: () => <span data-testid='icon-delete' />,
  Edit: () => <span data-testid='icon-edit' />,
  Plus: () => <span data-testid='icon-plus' />,
  Refresh: () => <span data-testid='icon-refresh' />,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    memory: {
      ensureScope: { invoke: (...args: unknown[]) => mockEnsureScope(...args) },
      listScopes: { invoke: (...args: unknown[]) => mockListScopes(...args) },
      listEntries: { invoke: (...args: unknown[]) => mockListEntries(...args) },
      upsertEntry: { invoke: (...args: unknown[]) => mockUpsertEntry(...args) },
      deleteEntry: { invoke: (...args: unknown[]) => mockDeleteEntry(...args) },
      clearScope: { invoke: (...args: unknown[]) => mockClearScope(...args) },
      deleteScope: { invoke: (...args: unknown[]) => mockDeleteScope(...args) },
    },
    extensions: {
      getAssistants: { invoke: (...args: unknown[]) => mockGetAssistants(...args) },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => mockConfigGet(...args),
  },
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({ children, disabled, icon, onClick }: any) => (
    <button disabled={disabled} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
  const Card = ({ title, extra, children }: any) => (
    <section>
      <header>
        <h2>{title}</h2>
        {extra}
      </header>
      {children}
    </section>
  );
  const Empty = ({ description }: any) => <div>{description}</div>;
  const Input = ({ value, onChange, placeholder }: any) => (
    <input value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />
  );
  Input.TextArea = ({ value, onChange, placeholder }: any) => (
    <textarea value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />
  );
  const Modal = ({ visible, title, children, onOk, onCancel }: any) =>
    visible ? (
      <div role='dialog' aria-label={title}>
        {children}
        <button onClick={onOk}>OK</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null;
  const Popconfirm = ({ children }: any) => <>{children}</>;
  const Select = ({ children, value, onChange }: any) => (
    <select value={value} onChange={(event) => onChange?.(event.target.value)}>
      {children}
    </select>
  );
  Select.Option = ({ value, children }: any) => <option value={value}>{children}</option>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Table = ({ columns, data, noDataElement }: any) => {
    if (!data || data.length === 0) return <div>{noDataElement}</div>;
    return (
      <table>
        <tbody>
          {data.map((row: any) => (
            <tr key={row.id}>
              {columns.map((column: any, index: number) => (
                <td key={column.dataIndex || index}>
                  {column.render ? column.render(column.dataIndex ? row[column.dataIndex] : undefined, row) : row[column.dataIndex]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };
  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
  };

  return {
    Button,
    Card,
    Empty,
    Input,
    Message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
    Modal,
    Popconfirm,
    Select,
    Space,
    Table,
    Tag,
    Typography,
  };
});

import MemorySettings from '@/renderer/pages/settings/MemorySettings';

const researchScope: MemoryScope = {
  id: 'user:local/workspace:global/assistant:assistant-research',
  userId: 'local',
  workspaceId: 'global',
  assistantId: 'assistant-research',
  assistantName: '研究助手',
  backend: 'local-json',
  entryCount: 1,
  createdAt: 1,
  updatedAt: 2,
};

const researchEntry: MemoryEntry = {
  id: 'entry-1',
  scopeId: researchScope.id,
  kind: 'preference',
  content: '回答时优先使用中文总结。',
  tags: ['style'],
  source: 'settings',
  createdAt: 1,
  updatedAt: 2,
};

describe('MemorySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigGet.mockResolvedValue([
      {
        id: 'assistant-research',
        name: '研究助手',
        description: '做资料整理',
        isPreset: true,
        isBuiltin: false,
        enabled: true,
      },
      {
        id: 'assistant-writing',
        name: '写作助手',
        description: '写文案',
        isPreset: true,
        isBuiltin: false,
        enabled: true,
      },
    ]);
    mockGetAssistants.mockResolvedValue([]);
    mockListScopes.mockResolvedValue([researchScope]);
    mockListEntries.mockImplementation(({ scopeId }) => Promise.resolve(scopeId === researchScope.id ? [researchEntry] : []));
  });

  it('shows every assistant with its memory count, including assistants with no memory yet', async () => {
    render(<MemorySettings />);

    const researchCard = await screen.findByTestId('memory-assistant-card-assistant-research');
    const writingCard = await screen.findByTestId('memory-assistant-card-assistant-writing');

    expect(within(researchCard).getByText('研究助手')).toBeInTheDocument();
    expect(within(researchCard).getByText('1 条记忆')).toBeInTheDocument();
    expect(within(researchCard).getByText('1 个记忆区')).toBeInTheDocument();
    expect(within(writingCard).getByText('写作助手')).toBeInTheDocument();
    expect(within(writingCard).getByText('0 条记忆')).toBeInTheDocument();
    expect(within(writingCard).getByText('0 个记忆区')).toBeInTheDocument();
  });

  it('labels the global workspace scope as the assistant default memory scope', async () => {
    render(<MemorySettings />);

    expect(await screen.findByText('研究助手 · 默认记忆区')).toBeInTheDocument();
    expect(screen.getByText('默认记忆区 · 1 条记忆')).toBeInTheDocument();
    expect(screen.getByText('范围: 默认（未绑定具体工作区）')).toBeInTheDocument();
  });

  it('shows the selected assistant memory and an explicit empty state for a zero-memory assistant', async () => {
    render(<MemorySettings />);

    expect(await screen.findByText('回答时优先使用中文总结。')).toBeInTheDocument();

    fireEvent.click(await screen.findByTestId('memory-assistant-card-assistant-writing'));

    await waitFor(() => {
      expect(screen.getByText('写作助手当前没有记忆')).toBeInTheDocument();
    });
  });

  it('offers a first-memory action instead of a table-only empty state', async () => {
    render(<MemorySettings />);

    fireEvent.click(await screen.findByTestId('memory-assistant-card-assistant-writing'));

    expect(await screen.findByText('新增第一条记忆')).toBeInTheDocument();
  });
});
