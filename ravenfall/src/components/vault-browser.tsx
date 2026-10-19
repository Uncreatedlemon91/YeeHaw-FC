"use client";

import { Check, FilePlus2, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CategoryIcon, CategoryRibbon, categoryLabel } from "@/components/vault-category";

export type VaultDoc = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  version: number;
  updated: string;
  holders: number;
  held: boolean;
};

export function VaultBrowser({ docs, canCreate, filtered }: { docs: VaultDoc[]; canCreate: boolean; filtered: boolean }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = needle ? docs.filter((d) => `${d.title} ${d.summary}`.toLowerCase().includes(needle)) : docs;

  return (
    <div className="flex flex-col gap-4">
      {docs.length > 0 && (
        <div className="relative max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search documents…"
            aria-label="Search documents"
            className="pl-9"
          />
        </div>
      )}
      {list.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <li key={d.id}>
              <Link
                href={`/vault/${d.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CategoryRibbon category={d.category} />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2 text-micro font-semibold uppercase tracking-label text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CategoryIcon category={d.category} className="size-4 group-hover:text-accent" />
                      {categoryLabel(d.category)}
                    </span>
                    {d.held && (
                      <span className="flex items-center gap-1 text-success-fg">
                        <Check aria-hidden className="size-3.5" /> Qualified
                      </span>
                    )}
                  </div>
                  <div className="font-display text-lg font-semibold uppercase leading-tight">{d.title}</div>
                  {d.summary && <p className="line-clamp-3 text-sm text-muted-foreground">{d.summary}</p>}
                  <div className="mt-auto pt-2 text-xs text-muted-foreground">
                    v{d.version} · {d.updated} · {d.holders} qualified
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
          {docs.length ? <SearchX aria-hidden className="size-8 text-muted-foreground" /> : <FilePlus2 aria-hidden className="size-8 text-muted-foreground" />}
          <p className="text-sm text-muted-foreground">
            {docs.length ? `No documents match “${q}”.` : filtered ? "No documents in this category yet." : "The vault is empty."}
          </p>
          {docs.length ? (
            <Button variant="outline" size="sm" onClick={() => setQ("")}>
              Clear search
            </Button>
          ) : (
            canCreate && (
              <Button asChild size="sm">
                <Link href="/vault/new">
                  <FilePlus2 /> New document
                </Link>
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}
