import type { BadgeProps } from '@arco-design/web-react';
import { Badge } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useEffect, useMemo, useState } from 'react';
import type { IMessageAcpToolCall, IMessageToolGroup } from '@/common/chat/chatLib';
import LocalImageView from '@renderer/components/media/LocalImageView';
import './MessageToolGroupSummary.css';

type ToolItem = {
  key: string;
  name: string;
  desc: string;
  status: BadgeProps['status'];
  input?: string;
  output?: string;
  mediaPaths?: string[];
};

const MEDIA_LINE_RE = /^\s*MEDIA:\s*(.+?)\s*$/i;
const GENERATED_IMAGE_LINE_RE = /^\s*Generated image saved to:\s*(.+?)\s*$/i;
const IMAGE_PATH_RE = /\.(?:jpe?g|png|gif|webp|bmp|tiff|svg)(?:[?#].*)?$/i;

function cleanMediaPath(mediaPath: string): string {
  return mediaPath
    .trim()
    .replace(/^file:\/\//i, '')
    .replace(/^\/([A-Za-z]:[\\/])/, '$1')
    .replace(/^`|`$/g, '');
}

function getImageAlt(mediaPath: string): string {
  return mediaPath.split(/[/\\]/).pop() || mediaPath;
}

function splitGeneratedMedia(text: string): { text: string; mediaPaths: string[] } {
  const textLines: string[] = [];
  const mediaPaths: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(MEDIA_LINE_RE) || line.match(GENERATED_IMAGE_LINE_RE);
    if (match?.[1]) {
      mediaPaths.push(cleanMediaPath(match[1]));
      continue;
    }
    textLines.push(line);
  }

  return {
    text: textLines.join('\n').trim(),
    mediaPaths,
  };
}

function isImagePath(mediaPath: string): boolean {
  return IMAGE_PATH_RE.test(mediaPath);
}

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const getResultDisplayText = (resultDisplay: IMessageToolGroup['content'][0]['resultDisplay']): string | undefined => {
  if (!resultDisplay) return undefined;
  if (typeof resultDisplay === 'string') return resultDisplay;
  if ('fileDiff' in resultDisplay) return resultDisplay.fileDiff;
  if ('img_url' in resultDisplay) return resultDisplay.relative_path || resultDisplay.img_url;
  return undefined;
};

const ToolGroupMapper = (m: IMessageToolGroup): ToolItem[] => {
  if (!Array.isArray(m.content)) return [];
  return m.content.map(({ name, callId, description, confirmationDetails, status, resultDisplay }) => {
    let desc = typeof description === 'string' ? description.slice(0, 100) : '';
    const type = confirmationDetails?.type;
    if (type === 'edit') desc = confirmationDetails.fileName;
    if (type === 'exec') desc = confirmationDetails.command;
    if (type === 'info') desc = confirmationDetails.urls?.join(';') || confirmationDetails.title;
    if (type === 'mcp') desc = confirmationDetails.serverName + ':' + confirmationDetails.toolName;

    // Input: use full description (for error it's JSON.stringify(args), for success it's invocation description)
    // When confirmationDetails exists (Confirming state), use structured details instead
    let input: string | undefined;
    if (confirmationDetails) {
      const { title: _title, type: _type, ...rest } = confirmationDetails;
      if (Object.keys(rest).length) input = formatValue(rest);
    } else if (description) {
      input = description;
    }

    // Output: from resultDisplay (available for success/error/executing states)
    const output = getResultDisplayText(resultDisplay);
    const mediaPaths =
      resultDisplay && typeof resultDisplay !== 'string' && 'img_url' in resultDisplay
        ? [resultDisplay.img_url].filter(isImagePath)
        : undefined;

    return {
      key: callId,
      name,
      desc,
      status: (status === 'Success'
        ? 'success'
        : status === 'Error'
          ? 'error'
          : status === 'Canceled'
            ? 'default'
            : 'processing') as BadgeProps['status'],
      input,
      output,
      mediaPaths,
    };
  });
};

/**
 * Build a concise summary string from rawInput based on tool kind.
 * Shows the most relevant parameters so users can identify what the tool is doing.
 * e.g. Grep → "pattern" in path, Read → file_path, Execute → command
 */
const buildParamSummary = (kind: string, rawInput?: Record<string, unknown>): string | undefined => {
  if (!rawInput) return undefined;

  if (kind === 'read' || kind === 'edit') {
    return (rawInput.file_path as string) || (rawInput.path as string) || (rawInput.fileName as string);
  }
  if (kind === 'execute') {
    return rawInput.command as string;
  }
  if (kind === 'search' || kind === 'grep') {
    const parts: string[] = [];
    if (rawInput.pattern) parts.push(`"${rawInput.pattern}"`);
    if (rawInput.path) parts.push(`in ${rawInput.path}`);
    else if (rawInput.glob) parts.push(`in ${rawInput.glob}`);
    return parts.length > 0 ? parts.join(' ') : undefined;
  }
  if (kind === 'glob') {
    const parts: string[] = [];
    if (rawInput.pattern) parts.push(`${rawInput.pattern}`);
    if (rawInput.path) parts.push(`in ${rawInput.path}`);
    return parts.length > 0 ? parts.join(' ') : undefined;
  }
  if (kind === 'write') {
    return (rawInput.file_path as string) || (rawInput.path as string);
  }

  // Fallback: pick the first meaningful param value
  for (const key of ['file_path', 'command', 'path', 'pattern', 'query', 'url']) {
    if (rawInput[key] && typeof rawInput[key] === 'string') return rawInput[key] as string;
  }
  return undefined;
};

const ToolAcpMapper = (message: IMessageAcpToolCall): ToolItem | undefined => {
  const update = message.content?.update;
  if (!update) return;

  // Input: from rawInput
  const input = update.rawInput ? formatValue(update.rawInput) : undefined;

  // Output: from content items
  let output: string | undefined;
  const mediaPaths: string[] = [];
  if (Array.isArray(update.content) && update.content.length) {
    output = update.content
      .map((item) => {
        if (item.type === 'content' && item.content?.type === 'text') {
          const result = splitGeneratedMedia(item.content.text);
          mediaPaths.push(...result.mediaPaths.filter(isImagePath));
          return result.text;
        }
        if (item.type === 'content' && item.content?.type === 'resource_link') {
          const mediaPath = cleanMediaPath(item.content.uri);
          if (isImagePath(mediaPath)) mediaPaths.push(mediaPath);
          return '';
        }
        if (item.type === 'diff' && item.path) return `[diff] ${item.path}`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  const keyParam = buildParamSummary(update.kind, update.rawInput);

  return {
    key: update.toolCallId,
    name: update.title,
    desc: keyParam || (update.rawInput?.command as string) || update.kind,
    status:
      update.status === 'completed'
        ? 'success'
        : update.status === 'failed'
          ? 'error'
          : ('default' as BadgeProps['status']),
    input,
    output,
    mediaPaths,
  };
};

const ToolItemDetail: React.FC<{ item: ToolItem }> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const hasMedia = !!item.mediaPaths?.length;
  const hasDetail = item.input || item.output || hasMedia;

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <Badge status={item.status} className={item.status === 'processing' ? 'badge-breathing' : ''}></Badge>
        <span
          className={
            'flex-1 min-w-0' +
            (expanded ? ' break-all' : ' truncate') +
            (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')
          }
          onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
        >
          <span className='font-medium text-13px'>{item.name}</span>
          {item.desc !== item.name && <span className='m-l-4px opacity-80 text-13px'>{item.desc}</span>}
        </span>
        {hasDetail && (
          <span
            className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors'
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
          </span>
        )}
      </div>
      {hasMedia && (
        <div className='m-l-20px m-t-6px flex flex-col gap-8px'>
          {item.mediaPaths?.map((mediaPath) => (
            <LocalImageView
              key={mediaPath}
              src={mediaPath}
              alt={getImageAlt(mediaPath)}
              className='max-w-240px max-h-320px rounded object-contain'
            />
          ))}
        </div>
      )}
      {expanded && (item.input || item.output) && (
        <div className='tool-detail-panel m-l-20px m-t-4px'>
          {item.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Input</div>
              <pre className='tool-detail-content'>{item.input}</pre>
            </div>
          )}
          {item.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Output</div>
              <pre className='tool-detail-content'>{item.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MessageToolGroupSummary: React.FC<{ messages: Array<IMessageToolGroup | IMessageAcpToolCall> }> = ({
  messages,
}) => {
  const hasRunningTools = messages.some(
    (m) =>
      (m.type === 'tool_group' &&
        Array.isArray(m.content) &&
        m.content.some((t) => t.status !== 'Success' && t.status !== 'Error' && t.status !== 'Canceled')) ||
      (m.type === 'acp_tool_call' &&
        !!m.content?.update &&
        m.content.update.status !== 'completed' &&
        m.content.update.status !== 'failed')
  );
  const [showMore, setShowMore] = useState(hasRunningTools);

  // Auto-expand when new tools start running (during creation)
  useEffect(() => {
    if (hasRunningTools) setShowMore(true);
  }, [hasRunningTools]);
  const tools = useMemo(() => {
    return messages
      .flatMap((m) => {
        if (m.type === 'tool_group') return ToolGroupMapper(m);
        return ToolAcpMapper(m);
      })
      .filter((item): item is ToolItem => item !== undefined);
  }, [messages]);

  return (
    <div>
      <div className='flex items-center gap-10px color-#86909C cursor-pointer' onClick={() => setShowMore(!showMore)}>
        <Badge status='default' text='View Steps' className={'![&_span.arco-badge-status-text]:color-#86909C'}></Badge>
        {showMore ? <IconDown /> : <IconRight />}
      </div>
      {showMore && (
        <div className='p-l-20px flex flex-col gap-8px pt-8px'>
          {tools.map((item) => (
            <ToolItemDetail key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(MessageToolGroupSummary);
