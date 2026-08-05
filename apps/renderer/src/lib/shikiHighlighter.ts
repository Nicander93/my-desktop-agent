/** Shiki 单例高亮，供 CodeBlock 异步渲染 */
import { createHighlighter, type Highlighter } from "shiki";

const LANGS = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "python",
  "bash",
  "shell",
  "json",
  "markdown",
  "css",
  "html",
  "sql",
  "yaml",
  "rust",
  "go",
  "text",
];

let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * 惰性创建并缓存 Shiki 高亮器，避免每个代码块重复加载主题和语言。
 */
function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: LANGS,
    });
  }
  return highlighterPromise!;
}

/** 返回高亮后的 HTML 字符串 */
export async function highlightCode(
  code: string,
  language?: string,
  theme: "light" | "dark" = "light",
): Promise<string> {
  const highlighter = await getHighlighter();
  const lang =
    language && highlighter.getLoadedLanguages().includes(language)
      ? language
      : "text";
  const shikiTheme = theme === "dark" ? "github-dark" : "github-light";
  return highlighter.codeToHtml(code, { lang, theme: shikiTheme });
}
