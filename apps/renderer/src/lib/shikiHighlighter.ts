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

export async function highlightCode(code: string, language?: string): Promise<string> {
  const highlighter = await getHighlighter();
  const lang = language && highlighter.getLoadedLanguages().includes(language)
    ? language
    : 'text';
  return highlighter.codeToHtml(code, { lang, theme: 'github-light' });
}
