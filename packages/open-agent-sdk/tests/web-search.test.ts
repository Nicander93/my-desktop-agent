/** WebSearch：解开 DDG 跳转链，并按 result 块配对 snippet。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseDuckDuckGoHtml,
  unwrapDdgUrl,
  WebSearchTool,
} from "../src/tools/web-search.js";

const ctx = { cwd: process.cwd() };

const DDG_HTML = `
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">
        Example <b>Docs</b>
      </a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">
      Official documentation for Example.
    </a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="https://other.dev/">
        Other Site
      </a>
    </h2>
    <a class="result__snippet" href="https://other.dev/">Second hit.</a>
  </div>
</div>
`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("unwrapDdgUrl", () => {
  it("decodes uddg redirect links", () => {
    expect(
      unwrapDdgUrl(
        "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&rut=abc",
      ),
    ).toBe("https://example.com/docs");
  });
});

describe("parseDuckDuckGoHtml", () => {
  it("pairs title, real URL and snippet per result block", () => {
    const results = parseDuckDuckGoHtml(DDG_HTML);
    expect(results).toEqual([
      {
        title: "Example Docs",
        url: "https://example.com/docs",
        snippet: "Official documentation for Example.",
      },
      {
        title: "Other Site",
        url: "https://other.dev/",
        snippet: "Second hit.",
      },
    ]);
  });
});

describe("WebSearchTool", () => {
  it("formats parsed results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(DDG_HTML, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const result = await WebSearchTool.call({ query: "example docs" }, ctx);
    expect(result.is_error).toBeFalsy();
    const text = String(result.content);
    expect(text).toContain("1. Example Docs");
    expect(text).toContain("https://example.com/docs");
    expect(text).not.toContain("duckduckgo.com/l/");
  });

  it("rejects empty query", async () => {
    const result = await WebSearchTool.call({ query: "  " }, ctx);
    expect(result.is_error).toBe(true);
  });
});
