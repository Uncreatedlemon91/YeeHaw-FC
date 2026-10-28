import sanitize from "sanitize-html";

// Sanitises an article's HTML before it is stored or rendered (port of
// proclubs/html_sanitize.py, which used nh3). Staff-written articles are
// Markdown (react-markdown escapes raw HTML by itself); HTML only comes from
// the AI roundup and from articles carried over from the old site. It is
// still web input reaching every visitor's browser, so it is never trusted
// outright: this runs when it is written AND again when it is shown.

const TAGS = [
  "p", "br", "hr", "strong", "em", "b", "i", "u", "s", "del", "blockquote", "pre", "code", "span",
  "ul", "ol", "li", "a", "img", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td",
];

/** Keeps one runaway article (mostly: pasted inline images) from becoming an unbounded row. */
export const MAX_HTML_LENGTH = 4_000_000;

export function sanitizeHtml(html: string): string {
  return sanitize(html || "", {
    allowedTags: TAGS,
    allowedAttributes: { a: ["href", "title", "rel"], img: ["src", "alt", "title"], code: ["class"] },
    // Inline images the old editor embedded survive as data: URIs, but only on
    // <img>: a data: link would be a (milder) way in.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    transformTags: { a: sanitize.simpleTransform("a", { rel: "noopener noreferrer nofollow" }, true) },
    disallowedTagsMode: "discard",
  });
}
