import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageAcpToolCall, IMessageToolGroup } from '@/common/chat/chatLib';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';

vi.mock('@arco-design/web-react', () => ({
  Badge: ({ text, children }: { text?: string; children?: React.ReactNode }) => (
    <span>
      {text}
      {children}
    </span>
  ),
}));

vi.mock('@arco-design/web-react/icon', () => ({
  IconDown: () => <span data-testid='icon-down'>down</span>,
  IconRight: () => <span data-testid='icon-right'>right</span>,
}));

vi.mock('@renderer/components/media/LocalImageView', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img data-testid='local-image' src={src} alt={alt} />,
}));

describe('MessageToolGroupSummary', () => {
  it('ignores malformed tool group content without crashing', () => {
    const malformedToolGroup = {
      id: 'tool-group-1',
      conversation_id: 'conversation-1',
      type: 'tool_group',
      content: 'not-an-array',
    } as unknown as IMessageToolGroup;

    const acpToolMessage = {
      id: 'acp-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tool-1',
          status: 'failed',
          title: 'Read',
          kind: 'read',
          rawInput: { file_path: 'README.md' },
          content: 'not-an-array',
        },
      },
    } as unknown as IMessageAcpToolCall;

    render(<MessageToolGroupSummary messages={[malformedToolGroup, acpToolMessage]} />);

    fireEvent.click(screen.getByText('View Steps'));

    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.queryByText('not-an-array')).toBeNull();
  });

  it('filters out malformed ACP messages that are missing update payloads', () => {
    const malformedAcpMessage = {
      id: 'acp-2',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {},
    } as unknown as IMessageAcpToolCall;

    render(<MessageToolGroupSummary messages={[malformedAcpMessage]} />);

    fireEvent.click(screen.getByText('View Steps'));

    expect(screen.queryByText('Input')).toBeNull();
    expect(screen.queryByText('Output')).toBeNull();
  });

  it('renders local image resource links from ACP tools in the expanded summary', () => {
    const imagePath = 'C:\\workspace\\blue-circle-test.svg';
    const acpToolMessage = {
      id: 'acp-3',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tool-3',
          status: 'completed',
          title: `View Image ${imagePath}`,
          kind: 'read',
          content: [
            {
              type: 'content',
              content: {
                name: imagePath,
                uri: imagePath,
                type: 'resource_link',
              },
            },
          ],
        },
      },
    } as unknown as IMessageAcpToolCall;

    render(<MessageToolGroupSummary messages={[acpToolMessage]} />);

    fireEvent.click(screen.getByText('View Steps'));

    expect(screen.getByTestId('local-image')).toHaveAttribute('src', imagePath);
  });
});
