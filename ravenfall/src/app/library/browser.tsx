import { ChevronRight, FileText, Folder, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  allFolders,
  canAuthor,
  canDelete,
  canRead,
  folderChain,
  getViewer,
  HIT_CLOSE,
  HIT_OPEN,
  readableClearances,
  searchDocs,
} from "@/lib/library";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";
import { ClearanceBadge } from "./clearance";
import { FolderTools } from "./folder-forms";

function Crumbs({ chain }: { chain: { id: string; name: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      <Link href="/library" className="hover:text-accent">
        Library
      </Link>
      {chain.map((f, i) => (
        <span key={f.id} className="flex items-center gap-1">
          <ChevronRight className="size-3.5" />
          {i === chain.length - 1 ? <span className="text-foreground">{f.name}</span> : <Link href={`/library/f/${f.id}`} className="hover:text-accent">{f.name}</Link>}
        </span>
      ))}
    </nav>
  );
}

function SearchBox({ q }: { q?: string }) {
  return (
    <form action="/library" className="mb-6 flex gap-2">
      <Input name="q" defaultValue={q} placeholder="Search the library" aria-label="Search the library" className="max-w-md" />
      <Button type="submit" variant="outline">
        <Search /> Search
      </Button>
    </form>
  );
}

function Snippet({ text }: { text: string }) {
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {text.split(HIT_OPEN).map((part, i) => {
        if (i === 0) return part;
        const [hit, ...rest] = part.split(HIT_CLOSE);
        return (
          <span key={i}>
            <mark className="rounded bg-accent/25 px-0.5 text-foreground">{hit}</mark>
            {rest.join(HIT_CLOSE)}
          </span>
        );
      })}
    </p>
  );
}

/** The library index (folderId null) or one folder; also the search results. */
export async function Browser({ folderId, q }: { folderId: string | null; q?: string }) {
  const viewer = await getViewer();
  const folders = await allFolders();
  const current = folderId ? folders.find((f) => f.id === folderId) : null;
  // Folders you aren't cleared for look exactly like folders that don't exist.
  if (folderId && (!current || !canRead(viewer, current.clearance))) return null;

  const chain = folderChain(folders, folderId);
  const author = canAuthor(viewer);
  const search = q?.trim();

  if (search && !folderId) {
    const hits = await searchDocs(viewer, search);
    return (
      <Container>
        <PageHeader eyebrow="Library" title="Search" description={`${hits.length} result${hits.length === 1 ? "" : "s"} for “${search}”`} />
        <SearchBox q={search} />
        {!hits.length && <Card className="py-12 text-center text-sm text-muted-foreground">Nothing matches.</Card>}
        <div className="flex flex-col gap-3">
          {hits.map((h) => (
            <Link key={h.slug} href={`/library/${h.slug}`} className="rounded-lg border bg-card p-4 hover:border-accent/50">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-semibold uppercase">{h.title}</span>
                <ClearanceBadge clearance={h.clearance} />
              </div>
              {h.folderId && <div className="text-xs text-muted-foreground">{folderChain(folders, h.folderId).map((f) => f.name).join(" / ")}</div>}
              <Snippet text={h.snippet || h.summary} />
            </Link>
          ))}
        </div>
      </Container>
    );
  }

  const allowed = readableClearances(viewer);
  const [docs, counts] = await Promise.all([
    prisma.libraryDocument.findMany({
      where: { folderId, clearance: { in: allowed } },
      orderBy: { title: "asc" },
      select: { id: true, slug: true, title: true, summary: true, clearance: true, updatedAt: true },
    }),
    prisma.libraryDocument.groupBy({ by: ["folderId"], where: { clearance: { in: allowed } }, _count: true }),
  ]);
  const subfolders = folders.filter((f) => f.parentId === folderId && canRead(viewer, f.clearance));
  const docCount = new Map(counts.map((c) => [c.folderId, c._count]));
  const newDoc = `/library/new${folderId ? `?folder=${folderId}` : ""}`;

  return (
    <Container>
      <Crumbs chain={chain} />
      <PageHeader
        eyebrow={current ? "Library folder" : "Doctrine & reference"}
        title={current ? current.name : "Library"}
        description={current ? undefined : "Documents, guides and references. You only see what you're cleared for."}
        actions={
          <>
            {current && <ClearanceBadge clearance={current.clearance} />}
            {author && (
              <Button asChild>
                <Link href={newDoc}>
                  <Plus /> New document
                </Link>
              </Button>
            )}
          </>
        }
      />
      <SearchBox />

      {!subfolders.length && !docs.length && (
        <Card className="py-16 text-center text-sm text-muted-foreground">{current ? "This folder is empty." : "The library is empty."}</Card>
      )}

      {subfolders.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subfolders.map((f) => (
            <Link key={f.id} href={`/library/f/${f.id}`} className="group flex items-center gap-3 rounded-lg border bg-card p-4 hover:border-accent/50">
              <Folder className="size-6 text-muted-foreground group-hover:text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg font-semibold uppercase">{f.name}</div>
                <div className="text-xs text-muted-foreground">
                  {docCount.get(f.id) ?? 0} document{(docCount.get(f.id) ?? 0) === 1 ? "" : "s"}
                </div>
              </div>
              <ClearanceBadge clearance={f.clearance} />
            </Link>
          ))}
        </div>
      )}

      {docs.length > 0 && (
        <div className="flex flex-col gap-2">
          {docs.map((d) => (
            <Link key={d.id} href={`/library/${d.slug}`} className="group flex items-start gap-3 rounded-lg border bg-card p-4 hover:border-accent/50">
              <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground group-hover:text-accent" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-lg font-semibold uppercase">{d.title}</div>
                {d.summary && <p className="text-sm text-muted-foreground">{d.summary}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <ClearanceBadge clearance={d.clearance} />
                <span className="text-xs text-muted-foreground">{fmtDate(d.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {author && viewer && <FolderTools viewer={viewer} folders={folders} current={current ?? null} canDeleteFull={canDelete(viewer)} />}
    </Container>
  );
}
