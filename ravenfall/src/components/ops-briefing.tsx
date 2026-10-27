import { Markdown } from "@/components/markdown";

const SMEAC = /^(situation|mission|execution|sustainment|service support|command(?: and| &)? (?:signal|control)|command|signal)\b/i;

function slug(s: string) {
  return "brief-" + s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Briefing markdown; with SMEAC-style headings it gains a section nav. */
export function OpsBriefing({ children }: { children: string }) {
  const parts = children.split(/^(?=#{1,3}\s)/m).filter((p) => p.trim());
  const heads = parts.map((p) => /^#{1,3}\s+(.+)$/m.exec(p.split("\n")[0])?.[1]?.trim() ?? null);
  const smeac = heads.filter((h) => h && SMEAC.test(h)).length >= 2;
  if (!smeac) return <Markdown>{children}</Markdown>;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Briefing sections" className="flex flex-wrap gap-1.5">
        {heads.map((h) =>
          h ? (
            <a key={h} href={`#${slug(h)}`} className="rounded-sm border px-2 py-1 text-micro font-semibold uppercase tracking-label text-accent hover:bg-secondary">
              {h.replace(/^\d+\.\s*/, "")}
            </a>
          ) : null,
        )}
      </nav>
      {parts.map((p, i) => (
        <section key={i} id={heads[i] ? slug(heads[i]!) : undefined} className="scroll-mt-20">
          <Markdown>{p}</Markdown>
        </section>
      ))}
    </div>
  );
}
