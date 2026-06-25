import { Fragment, isValidElement, cloneElement, memo, type MouseEvent, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { splitTextWithFilePaths } from '@/lib/filePathUtils';
import { CodeBlock } from './CodeBlock';
import { FilePathLink } from './FilePathLink';

const proseClass =
  'prose prose-gray prose-sm max-w-none ' +
  'prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0 ' +
  'prose-code:before:content-none prose-code:after:content-none ' +
  'prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.875em]';

function linkifyFilePaths(node: ReactNode): ReactNode {
  if (typeof node === 'string') {
    const segments = splitTextWithFilePaths(node);
    if (segments.length === 1 && segments[0].type === 'text') return node;
    return segments.map((seg, i) =>
      seg.type === 'path' ? (
        <FilePathLink key={i} path={seg.value} />
      ) : (
        <Fragment key={i}>{seg.value}</Fragment>
      )
    );
  }

  if (Array.isArray(node)) {
    return node.map((child, i) => <Fragment key={i}>{linkifyFilePaths(child)}</Fragment>);
  }

  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children) {
    return cloneElement(node, {
      ...node.props,
      children: linkifyFilePaths(node.props.children),
    });
  }

  return node;
}

function withFilePathLinks(Tag: 'p' | 'li' | 'td') {
  return function Block({ children, ...props }: React.HTMLAttributes<HTMLElement>) {
    return <Tag {...props}>{linkifyFilePaths(children)}</Tag>;
  };
}

export const markdownComponents: Components = {
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children, ...props }) {
    const text = String(children);
    const match = /language-(\w+)/.exec(className || '');
    const isBlock = Boolean(match) || text.includes('\n');

    if (!isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    return <CodeBlock language={match?.[1]}>{text}</CodeBlock>;
  },
  a({ href, children }) {
    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    };
    return (
      <a href={href} onClick={handleClick} className="text-blue-600 hover:underline">
        {children}
      </a>
    );
  },
  p: withFilePathLinks('p'),
  li: withFilePathLinks('li'),
  td: withFilePathLinks('td'),
};

export const MarkdownBlock = memo(function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className={proseClass}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
