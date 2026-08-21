/**
 * WebFetch：拉取 URL 并转成模型可读文本。
 *
 * HTML 用正则转成近似 Markdown（标题、链接、列表），不引入解析库。
 * SPA / 无静态正文的页面会几乎是空的；升级路径是 Readability 或无头浏览器。
 */

import { defineTool } from "./define.js";

const MAX_CHARS = 100_000;
const MAX_BYTES = 2_000_000;
const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BINARY_TYPE =
  /^(image|audio|video|font|application\/octet-stream|application\/pdf|application\/zip)\b/i;

/**
 * 解码常见 HTML 实体。不覆盖完整命名实体表。
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function collapseWs(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 相对链接按页面 URL 展开；非法 href 原样返回。 */
function resolveHref(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

/**
 * 把 HTML 转成近似 Markdown，保留标题和链接供后续 WebFetch。
 */
export function htmlToText(html: string, baseUrl = ""): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? collapseWs(decodeEntities(stripTags(titleMatch[1])))
    : "";

  let text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  text = text.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, inner: string) => {
      const label = collapseWs(decodeEntities(stripTags(inner)));
      if (!label) return "";
      if (/^(javascript:|data:)/i.test(href)) return label;
      return `[${label}](${resolveHref(href, baseUrl)})`;
    },
  );

  text = text
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n")
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
    .replace(/<h[4-6]\b[^>]*>([\s\S]*?)<\/h[4-6]>/gi, "\n\n#### $1\n\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|blockquote|section|article|header|footer)>/gi, "\n\n")
    .replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  text = collapseWs(decodeEntities(stripTags(text)));
  if (title && !text.startsWith(`# ${title}`)) {
    text = `# ${title}\n\n${text}`;
  }
  return text;
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, MAX_CHARS)}\n\n...(truncated, ${text.length} chars total)`;
}

/** 只接受 http/https，避免 file: 等本地协议。 */
function parseHttpUrl(url: string): URL | { data: string; is_error: true } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { data: `Invalid URL: ${url}`, is_error: true };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      data: `Only http/https URLs are supported: ${url}`,
      is_error: true,
    };
  }
  return parsed;
}

export const WebFetchTool = defineTool({
  name: "WebFetch",
  description:
    "Fetch content from a URL and return it as text. HTML is converted to Markdown-like text (headings, links, lists). Supports JSON APIs and plain text.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch content from",
      },
      headers: {
        type: "object",
        description: "Optional HTTP headers",
      },
    },
    required: ["url"],
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  /**
   * 拉取远程内容；HTML/JSON 在本地转成可读文本，网络失败归一化为工具错误。
   */
  async call(input, _context) {
    const parsed = parseHttpUrl(String(input.url ?? ""));
    if (!(parsed instanceof URL)) return parsed;

    try {
      const response = await fetch(parsed.href, {
        headers: {
          "User-Agent": FETCH_UA,
          Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8",
          ...input.headers,
        },
        signal: AbortSignal.timeout(30000),
        redirect: "follow",
      });

      if (!response.ok) {
        return {
          data: `HTTP ${response.status}: ${response.statusText}`,
          is_error: true,
        };
      }

      const contentType = response.headers.get("content-type") || "";
      const mime = contentType.split(";")[0].trim();
      if (BINARY_TYPE.test(mime)) {
        return {
          data: `Cannot extract text from ${mime}: ${parsed.href}`,
          is_error: true,
        };
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
        return {
          data: `Response too large (${contentLength} bytes)`,
          is_error: true,
        };
      }

      let text = await response.text();
      if (mime.includes("json") || parsed.pathname.endsWith(".json")) {
        text = prettyJson(text);
      } else if (mime.includes("html") || /^\s*</.test(text)) {
        text = htmlToText(text, response.url || parsed.href);
      }

      return truncate(text) || "(empty response)";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        data: `Error fetching ${parsed.href}: ${message}`,
        is_error: true,
      };
    }
  },
});
