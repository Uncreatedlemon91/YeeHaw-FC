import type { LibraryClearance, LibraryFolder, User } from "@prisma/client";
import { cache } from "react";
import { getSessionUser } from "./auth";
import { hasPerm, type Perm } from "./permissions";
import { isLeader } from "./personnel";
import { prisma } from "./prisma";
import { slugify } from "./utils";

// The document library: clearance tiers and folder-tree helpers. Every page,
// action and route handler under /library decides access through here.

export const CLEARANCES: readonly LibraryClearance[] = ["PUBLIC", "UNIT", "LEADERSHIP", "COMMAND"];

const LEVEL: Record<LibraryClearance, number> = { PUBLIC: 0, UNIT: 1, LEADERSHIP: 2, COMMAND: 3 };

export const CLEARANCE_LABEL: Record<LibraryClearance, string> = {
  PUBLIC: "Public",
  UNIT: "Unit",
  LEADERSHIP: "Leadership",
  COMMAND: "Command",
};

export const CLEARANCE_HELP: Record<LibraryClearance, string> = {
  PUBLIC: "Anyone, signed in or not",
  UNIT: "Any operator",
  LEADERSHIP: "Squad leaders, instructors and Command",
  COMMAND: "Command only",
};

/** Slugs that would collide with a /library route. */
const RESERVED_SLUGS = new Set(["new", "f", "compliance", "search"]);

export type Viewer = {
  id: string;
  perms: Perm[];
  user: Pick<User, "id" | "squad" | "unitRole" | "status">;
};

/** The signed-in member with the bits clearance needs, or null for a guest. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getSessionUser();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, squad: true, unitRole: true, status: true },
  });
  return user ? { id: session.id, perms: session.perms, user } : null;
});

/** Highest tier the viewer is cleared for (guests get PUBLIC). */
export function viewerLevel(viewer: Viewer | null): number {
  if (!viewer) return LEVEL.PUBLIC;
  if (hasPerm(viewer.perms, "ADMIN")) return LEVEL.COMMAND;
  if (hasPerm(viewer.perms, "INSTRUCTOR") || isLeader(viewer.user)) return LEVEL.LEADERSHIP;
  if (hasPerm(viewer.perms, "OPERATOR")) return LEVEL.UNIT;
  return LEVEL.PUBLIC;
}

export function canRead(viewer: Viewer | null, clearance: LibraryClearance): boolean {
  return viewerLevel(viewer) >= LEVEL[clearance];
}

/** Tiers the viewer may read, for SQL / Prisma filters. */
export function readableClearances(viewer: Viewer | null): LibraryClearance[] {
  return CLEARANCES.filter((c) => canRead(viewer, c));
}

/** INSTRUCTOR and ADMIN publish and organise. */
export function canAuthor(viewer: Viewer | null): boolean {
  return !!viewer && hasPerm(viewer.perms, "INSTRUCTOR");
}

/** Only ADMIN deletes documents, and non-empty folders. */
export function canDelete(viewer: Viewer | null): boolean {
  return !!viewer && hasPerm(viewer.perms, "ADMIN");
}

/** True when `a` is looser (readable by more people) than `b`. */
export function looser(a: LibraryClearance, b: LibraryClearance): boolean {
  return LEVEL[a] < LEVEL[b];
}

export function stricter(a: LibraryClearance, b: LibraryClearance): LibraryClearance {
  return LEVEL[a] >= LEVEL[b] ? a : b;
}

/** Minimum-clearance rule: a child may equal or tighten its container, never loosen it. */
export function checkClearance(
  viewer: Viewer,
  clearance: LibraryClearance,
  container: LibraryClearance | null | undefined,
  what: string,
): string | null {
  if (container && looser(clearance, container))
    return `${what} can't be looser than its folder (${CLEARANCE_LABEL[container]}).`;
  // Authors can only file things they could read themselves.
  if (!canRead(viewer, clearance)) return `You can't set a clearance above your own.`;
  return null;
}

// --- Folder tree --------------------------------------------------------- //

/** Every folder. The tree is small, so it's walked in memory. */
export async function allFolders(): Promise<LibraryFolder[]> {
  return prisma.libraryFolder.findMany({ orderBy: { name: "asc" } });
}

/** Root-first chain of folders ending at `id` (empty for the top level). */
export function folderChain(folders: LibraryFolder[], id: string | null | undefined): LibraryFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: LibraryFolder[] = [];
  for (let cur = id ? byId.get(id) : undefined; cur && chain.length < 50; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    chain.unshift(cur);
  }
  return chain;
}

/** `id` and every folder beneath it. */
export function subtreeIds(folders: LibraryFolder[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    for (const f of folders) if (f.parentId === out[i]) out.push(f.id);
  }
  return out;
}

export function folderPathName(folders: LibraryFolder[], id: string | null | undefined): string {
  return folderChain(folders, id)
    .map((f) => f.name)
    .join(" / ");
}

/** A free slug for `title`, steering clear of routes and existing documents. */
export async function uniqueSlug(title: string): Promise<string> {
  let slug = slugify(title) || "document";
  if (RESERVED_SLUGS.has(slug) || (await prisma.libraryDocument.findUnique({ where: { slug }, select: { id: true } })))
    slug = `${slug}-${Date.now().toString(36)}`;
  return slug;
}

// --- Search -------------------------------------------------------------- //

export type SearchHit = { slug: string; title: string; summary: string; clearance: LibraryClearance; folderId: string | null; snippet: string };

// Marks around matched words in a snippet; the page splits on them, so
// document text is never injected as markup.
export const HIT_OPEN = "‹‹";
export const HIT_CLOSE = "››";

/**
 * Full-text search over title + content, limited to what the viewer may read.
 * The tsvector expression matches the GIN index in the library migration.
 */
export async function searchDocs(viewer: Viewer | null, q: string): Promise<SearchHit[]> {
  const allowed = readableClearances(viewer);
  return prisma.$queryRaw<SearchHit[]>`
    SELECT d."slug", d."title", d."summary", d."clearance", d."folderId",
           ts_headline('english', d."content", websearch_to_tsquery('english', ${q}),
                       ${`StartSel=${HIT_OPEN}, StopSel=${HIT_CLOSE}, MaxFragments=1, MaxWords=24, MinWords=8`}) AS "snippet"
    FROM "LibraryDocument" d
    WHERE to_tsvector('english', d."title" || ' ' || d."content") @@ websearch_to_tsquery('english', ${q})
      AND d."clearance"::text = ANY(${allowed})
    ORDER BY ts_rank(to_tsvector('english', d."title" || ' ' || d."content"), websearch_to_tsquery('english', ${q})) DESC, d."title"
    LIMIT 50`;
}

/** Vault qualifications a document can be linked to. */
export async function qualificationOptions() {
  return prisma.qualification.findMany({
    select: { id: true, title: true, category: true },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
}
