/** WebFetch：HTML 转 Markdown、协议校验、JSON 美化。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { htmlToText, WebFetchTool } from "../src/tools/web-fetch.js";

const ctx = { cwd: process.cwd() };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("htmlToText", () => {
  it("keeps title, headings, links and lists", () => {
    const html = `
      <html>
        <head><title>Docs</title><style>body{color:red}</style></head>
        <body>
          <script>alert(1)</script>
          <h1>Install</h1>
          <p>See the <a href="/guide">guide</a> first.</p>
          <ul><li>One</li><li>Two</li></ul>
        </body>
      </html>
    `;
    const text = htmlToText(html, "https://example.com/docs");
    expect(text).toContain("# Docs");
    expect(text).toContain("# Install");
    expect(text).toContain("[guide](https://example.com/guide)");
    expect(text).toContain("- One");
    expect(text).toContain("- Two");
    expect(text).not.toContain("alert(1)");
    expect(text).not.toContain("color:red");
  });

  it("decodes entities", () => {
    expect(htmlToText("<p>A &amp; B &#39;C&#39;</p>")).toContain("A & B 'C'");
  });
});

describe("WebFetchTool", () => {
  it("rejects non-http URLs", async () => {
    const result = await WebFetchTool.call({ url: "file:///etc/passwd" }, ctx);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toContain("http/https");
  });

  it("pretty-prints JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response('{"a":1}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const result = await WebFetchTool.call(
      { url: "https://example.com/api" },
      ctx,
    );
    expect(result.is_error).toBeFalsy();
    expect(String(result.content)).toContain('"a": 1');
  });

  it("converts HTML via fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          "<html><title>Hi</title><body><a href='/x'>next</a></body></html>",
          {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          },
        ),
      ),
    );
    const result = await WebFetchTool.call(
      { url: "https://example.com/" },
      ctx,
    );
    expect(result.is_error).toBeFalsy();
    expect(String(result.content)).toContain("[next](https://example.com/x)");
  });

  it("refuses binary content types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("fake", {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      ),
    );
    const result = await WebFetchTool.call(
      { url: "https://example.com/a.pdf" },
      ctx,
    );
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toContain("application/pdf");
  });
});
