/** Shiki 单例高亮，供 CodeBlock 异步渲染 */
import { createHighlighter, type Highlighter } from 'shiki';

const LANGS = [
  'javascript', 'typescript', 'tsx', 'jsx', 'python', 'bash', 'shell',
  'json', 'markdown', 'css', 'html', 'sql', 'yaml', 'rust', 'go', 'text',
];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light'],
      langs: LANGS,
    });
  }
  return highlighterPromise!;
}

/** 返回高亮后的 HTML 字符串 */
export async function highlightCode(code: string, language?: string): Promise<string> {
  const highlighter = await getHighlighter();
  const lang = language && highlighter.getLoadedLanguages().includes(language)
    ? language
    : 'text';
  return highlighter.codeToHtml(code, { lang, theme: 'github-light' });
}
