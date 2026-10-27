import { ChevronRight } from "lucide-react";
import Link from "next/link";

/** Library > folder > subfolder, for pages about one document. */
export function DocCrumbs({ chain, last }: { chain: { id: string; name: string }[]; last?: React.ReactNode }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      <Link href="/library" className="hover:text-accent">
        Library
      </Link>
      {chain.map((f) => (
        <span key={f.id} className="flex items-center gap-1">
          <ChevronRight className="size-3.5" />
          <Link href={`/library/f/${f.id}`} className="hover:text-accent">
            {f.name}
          </Link>
        </span>
      ))}
      {last && (
        <span className="flex items-center gap-1">
          <ChevronRight className="size-3.5" />
          {last}
        </span>
      )}
    </nav>
  );
}
