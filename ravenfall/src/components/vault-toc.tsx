import { ListTree } from "lucide-react";
import type { Heading } from "@/components/markdown";

/** On-this-page list for long documents; sticky in the sidebar on desktop. */
export function VaultToc({ headings }: { headings: Heading[] }) {
  const min = Math.min(...headings.map((h) => h.level));
  return (
    <nav aria-label="On this page" className="rounded-lg border bg-card p-4">
      <p className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-label text-muted-foreground">
        <ListTree aria-hidden className="size-3.5" /> On this page
      </p>
      <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto text-sm">
        {headings.map((h) => (
          <li key={h.id} style={{ paddingLeft: `${(h.level - min) * 0.75}rem` }}>
            <a href={`#${h.id}`} className="block truncate py-0.5 text-muted-foreground hover:text-accent">
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
