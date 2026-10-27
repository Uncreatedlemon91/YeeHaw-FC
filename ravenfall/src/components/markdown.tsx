import { Link as LinkIcon } from "lucide-react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type Heading = { id: string; text: string; level: number };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[`*_~[\]]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-") || "section";

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}

function uniquer() {
  const seen = new Map<string, number>();
  return (base: string) => {
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

/** H2/H3 headings of a Markdown source (code fences skipped), ids matching the rendered anchors. */
export function extractHeadings(md: string): Heading[] {
  const uid = uniquer();
  const out: Heading[] = [];
  let fence = false;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/[`*_~]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    out.push({ id: uid(slug(text)), text, level: m[1].length });
  }
  return out;
}

// react-markdown escapes raw HTML by default, so member-written debriefs and
// SOPs can't inject markup.
export function Markdown({ children }: { children: string }) {
  const uid = uniquer();
  const heading = (Tag: "h1" | "h2" | "h3" | "h4", cls: string): Components["h1"] =>
    function H({ children }) {
      const id = uid(slug(textOf(children)));
      return (
        <Tag id={id} className={`group scroll-mt-20 ${cls}`}>
          {children}
          <a href={`#${id}`} aria-label="Link to this section" className="ml-2 inline-block align-middle text-muted-foreground no-underline opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100">
            <LinkIcon className="size-3.5" aria-hidden />
          </a>
        </Tag>
      );
    };

  const components: Components = {
    h1: heading("h1", "mt-10 mb-4 border-b pb-2 font-display text-2xl font-bold uppercase tracking-display first:mt-0"),
    h2: heading("h2", "mt-9 mb-3 border-b pb-1.5 font-display text-xl font-semibold uppercase tracking-display text-accent first:mt-0"),
    h3: heading("h3", "mt-6 mb-2 font-display text-base font-semibold uppercase tracking-display"),
    h4: heading("h4", "mt-5 mb-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground"),
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto rounded-md border" tabIndex={0} role="region" aria-label="Table">
        <table className="m-0 w-full min-w-max border-collapse text-left text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</th>,
    td: ({ children }) => <td className="border-b px-3 py-2 align-top last:border-b-0">{children}</td>,
    pre: ({ children }) => (
      <pre className="my-4 overflow-x-auto rounded-md border bg-background/70 p-4 font-mono text-xs leading-relaxed">{children}</pre>
    ),
    code: ({ className, children }) =>
      className ? (
        <code className={`${className} bg-transparent p-0`}>{children}</code>
      ) : (
        <code className="rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
      ),
    blockquote: ({ children }) => (
      <blockquote className="my-4 rounded-r-md border-l-2 border-accent bg-accent/5 py-1 pl-4 pr-3 text-muted-foreground [&>p]:my-2">{children}</blockquote>
    ),
    p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
    hr: () => <hr className="my-8 border-border" />,
  };

  return (
    <div className="prose-tac max-w-none text-[0.9375rem] [&_li>ul]:my-1 [&_li>ol]:my-1 [&_img]:h-auto [&_img]:max-w-full">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
