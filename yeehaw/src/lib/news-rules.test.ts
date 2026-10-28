import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./html-sanitize";
import { announceEmbed, parseArticle, uniqueSlug } from "./news-rules";
import { sniffImage } from "./news-images";

const form = (o: Record<string, string>) => (k: string) => o[k] ?? "";
const good = { title: " Big win ", category: "NEWS", summary: "", body: "# Hello", published: "on" };

describe("parseArticle", () => {
  it("reads a good form", () => {
    expect(parseArticle(form(good))).toEqual({ ok: true, value: { title: "Big win", category: "NEWS", summary: null, body: "# Hello", published: true } });
  });
  it("unticked means draft", () => {
    const r = parseArticle(form({ ...good, published: "" }));
    expect(r.ok && r.value.published).toBe(false);
  });
  it("names each problem", () => {
    const r = parseArticle(form({ title: "", category: "NOPE", summary: "x".repeat(301), body: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["body", "category", "summary", "title"]);
  });
});

describe("slugs", () => {
  it("makes a slug and avoids ones taken", () => {
    expect(uniqueSlug("Big Win vs Rivals!", new Set())).toBe("big-win-vs-rivals");
    expect(uniqueSlug("Big Win", new Set(["big-win"]))).toBe("big-win-2");
    expect(uniqueSlug("Big Win", new Set(["big-win", "big-win-2"]))).toBe("big-win-3");
    expect(uniqueSlug("???", new Set())).toBe("article");
  });
});

describe("announceEmbed", () => {
  const a = { title: "T", slug: "t", category: "TRANSFER" as const, summary: "dek", authorName: "Coach", publishedAt: new Date(Date.UTC(2026, 9, 20)), coverFile: "abc.webp" };
  it("links back to the article and carries its cover from the uploads route", () => {
    const e = announceEmbed(a, "https://yeehaw-fc.club");
    expect(e).toMatchObject({ title: "T", url: "https://yeehaw-fc.club/news/t", author: { name: "Transfer" }, description: "dek", footer: { text: "Posted by Coach" }, image: { url: "https://yeehaw-fc.club/api/uploads/articles/abc.webp" } });
  });
  it("leaves out what the article lacks", () => {
    const e = announceEmbed({ ...a, summary: null, authorName: null, coverFile: null }, "https://x");
    expect(e).not.toHaveProperty("description");
    expect(e).not.toHaveProperty("footer");
    expect(e).not.toHaveProperty("image");
  });
});

describe("sanitizeHtml", () => {
  it("keeps the formatting an article needs", () => {
    const html = "<h2>Title</h2><p>Some <strong>bold</strong> and <em>em</em></p><ul><li>a</li></ul><table><thead><tr><th>x</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><blockquote>q</blockquote>";
    expect(sanitizeHtml(html)).toBe(html);
  });
  it("strips scripts, handlers and styles", () => {
    const out = sanitizeHtml('<p onclick="x()" style="color:red">hi</p><script>alert(1)</script><iframe src="https://evil"></iframe><img src="x" onerror="alert(1)">');
    expect(out).not.toMatch(/script|onclick|onerror|style|iframe/i);
    expect(out).toContain("<p>hi</p>");
  });
  it("blocks javascript: links and gives links a safe rel", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript");
    const ok = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(ok).toContain('href="https://example.com"');
    expect(ok).toContain("noopener noreferrer nofollow");
  });
  it("allows data: only on images (the old editor embedded them), never on links", () => {
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).toContain("data:image/png");
    expect(sanitizeHtml('<a href="data:text/html;base64,AAAA">x</a>')).not.toContain("data:");
  });
  it("escapes what it can't keep as text rather than running it", () => {
    expect(sanitizeHtml("<p>a &lt;script&gt; b</p>")).toBe("<p>a &lt;script&gt; b</p>");
    expect(sanitizeHtml("")).toBe("");
  });
});

describe("sniffImage", () => {
  it("goes by the bytes, not the claim", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
