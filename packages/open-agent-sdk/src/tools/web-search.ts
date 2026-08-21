/**
 * WebSearch：用 DuckDuckGo HTML 页做免费搜索。
 *
 * 不接付费 Search API。DDG 改版或反爬时结果会空；升级路径是官方 API 或自建 SearXNG。
 */

import { defineTool } from "./define.js";

const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_RESULTS = 10;

/**
 * 解码常见 HTML 实体。
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
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * 解开 DuckDuckGo 的 `/l/?uddg=` 跳转链，得到真实结果 URL。
 */
export function unwrapDdgUrl(href: string): string {
  const raw = href.startsWith("//") ? `https:${href}` : href;
  try {
    const parsed = new URL(raw, "https://duckduckgo.com");
    return parsed.searchParams.get("uddg") || parsed.href;
  } catch {
    return href;
  }
}

/** 解开后仍是 DDG 自身的链接丢掉，不当成搜索结果。 */
function isDuckDuckGoHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "duckduckgo.com" || host.endsWith(".duckduckgo.com");
  } catch {
    return true;
  }
}

/**
 * 从 DDG HTML 搜索页抽出 title / url / snippet。按 result 块配对，避免两条正则对不齐。
 */
export function parseDuckDuckGoHtml(
  html: string,
): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  for (const block of html.split(/<div class="result /i).slice(1)) {
    const link = /class="result__a" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(
      block,
    );
    if (!link) continue;
    const url = unwrapDdgUrl(link[1]);
    const title = stripTags(link[2]);
    if (!title || !url || isDuckDuckGoHost(url)) continue;
    const snippetMatch =
      /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block) ||
      /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i.exec(block);
    results.push({
      title,
      url,
      snippet: snippetMatch ? stripTags(snippetMatch[1]) : "",
    });
  }
  return results;
}

function formatResults(
  query: string,
  results: Array<{ title: string; url: string; snippet: string }>,
  limit: number,
): string {
  const sliced = results.slice(0, limit);
  if (sliced.length === 0) return `No results found for "${query}"`;
  return sliced
    .map((item, i) => {
      let entry = `${i + 1}. ${item.title}\n   ${item.url}`;
      if (item.snippet) entry += `\n   ${item.snippet}`;
      return entry;
    })
    .join("\n\n");
}

export const WebSearchTool = defineTool({
  name: "WebSearch",
  description:
    "Search the web for information. Returns search results with titles, URLs, and snippets.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      num_results: {
        type: "number",
        description: "Number of results to return (default: 5, max: 10)",
      },
    },
    required: ["query"],
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  /**
   * 抓取 DuckDuckGo HTML 搜索页并转成模型可消费的条目列表。
   */
  async call(input, _context) {
    const query = String(input.query ?? "").trim();
    if (!query) {
      return { data: "Search query is required", is_error: true };
    }
    const limit = Math.min(
      Math.max(Number(input.num_results) || 5, 1),
      MAX_RESULTS,
    );

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": FETCH_UA,
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return {
          data: `Search failed: HTTP ${response.status}`,
          is_error: true,
        };
      }

      const html = await response.text();
      const results = parseDuckDuckGoHtml(html);
      if (
        results.length === 0 &&
        /anomaly|captcha|enable javascript|bot/i.test(html)
      ) {
        return {
          data: `Search blocked by DuckDuckGo for "${query}". Try a more specific query or WebFetch a known URL.`,
          is_error: true,
        };
      }
      return formatResults(query, results, limit);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: `Search error: ${message}`, is_error: true };
    }
  },
});
