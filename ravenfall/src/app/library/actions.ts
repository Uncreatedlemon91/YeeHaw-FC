"use server";

import type { LibraryClearance } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import {
  allFolders,
  canAuthor,
  canDelete,
  canRead,
  checkClearance,
  CLEARANCES,
  getViewer,
  looser,
  subtreeIds,
  uniqueSlug,
  type Viewer,
} from "@/lib/library";
import { prisma } from "@/lib/prisma";

// Every action re-checks permission and clearance on the server; the hidden
// buttons are only a convenience.

async function authorOrThrow(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || !canAuthor(viewer)) throw new Error("You don't have permission to do that.");
  return viewer;
}

function refresh() {
  revalidatePath("/library", "layout");
  revalidatePath("/");
}

const clearance = z.enum(CLEARANCES as [LibraryClearance, ...LibraryClearance[]]);
const optId = z.preprocess((v) => (typeof v === "string" && v ? v : null), z.string().nullable());

// --- Folders ------------------------------------------------------------- //

const folderSchema = z.object({
  name: z.string().trim().min(1, "Give the folder a name.").max(80),
  clearance,
  parentId: optId,
});

function parseFolder(data: FormData) {
  return folderSchema.safeParse({
    name: data.get("name"),
    clearance: data.get("clearance"),
    parentId: data.get("parentId"),
  });
}

export async function createFolder(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await authorOrThrow();
  const p = parseFolder(data);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const parent = p.data.parentId ? await prisma.libraryFolder.findUnique({ where: { id: p.data.parentId } }) : null;
  if (p.data.parentId && (!parent || !canRead(me, parent.clearance))) return { error: "Parent folder not found." };
  const bad = checkClearance(me, p.data.clearance, parent?.clearance, "A folder");
  if (bad) return { error: bad };
  if (await prisma.libraryFolder.findFirst({ where: { parentId: p.data.parentId, name: { equals: p.data.name, mode: "insensitive" } } }))
    return { error: "There's already a folder with that name here." };
  await prisma.libraryFolder.create({ data: p.data });
  refresh();
  return { ok: "Folder created." };
}

export async function updateFolder(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await authorOrThrow();
  const id = String(data.get("id"));
  const p = parseFolder(data);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const [folders, folder] = await Promise.all([allFolders(), prisma.libraryFolder.findUnique({ where: { id } })]);
  if (!folder || !canRead(me, folder.clearance)) return { error: "Folder not found." };

  const subtree = subtreeIds(folders, id);
  if (p.data.parentId && subtree.includes(p.data.parentId)) return { error: "A folder can't move into itself." };
  const parent = p.data.parentId ? folders.find((f) => f.id === p.data.parentId) : null;
  if (p.data.parentId && (!parent || !canRead(me, parent.clearance))) return { error: "Destination folder not found." };
  const bad = checkClearance(me, p.data.clearance, parent?.clearance, "A folder");
  if (bad) return { error: bad };
  if (
    await prisma.libraryFolder.findFirst({
      where: { parentId: p.data.parentId, id: { not: id }, name: { equals: p.data.name, mode: "insensitive" } },
    })
  )
    return { error: "There's already a folder with that name there." };

  // Tightening a folder tightens everything inside it, so the "never looser
  // than the folder" rule keeps holding.
  const looserTiers = CLEARANCES.filter((c) => looser(c, p.data.clearance));
  await prisma.$transaction([
    prisma.libraryFolder.update({ where: { id }, data: p.data }),
    prisma.libraryFolder.updateMany({ where: { id: { in: subtree }, clearance: { in: looserTiers } }, data: { clearance: p.data.clearance } }),
    prisma.libraryDocument.updateMany({ where: { folderId: { in: subtree }, clearance: { in: looserTiers } }, data: { clearance: p.data.clearance } }),
  ]);
  refresh();
  return { ok: "Folder saved." };
}

export async function deleteFolder(data: FormData) {
  const me = await authorOrThrow();
  const id = String(data.get("id"));
  const [folders, folder] = await Promise.all([allFolders(), prisma.libraryFolder.findUnique({ where: { id } })]);
  if (!folder || !canRead(me, folder.clearance)) throw new Error("Folder not found.");
  const ids = subtreeIds(folders, id);
  const docs = await prisma.libraryDocument.count({ where: { folderId: { in: ids } } });
  // Instructors can tidy away an empty folder; only Command empties a full one.
  if ((ids.length > 1 || docs > 0) && !canDelete(me)) throw new Error("Only Command can delete a folder that isn't empty.");
  await prisma.$transaction([
    prisma.libraryDocument.deleteMany({ where: { folderId: { in: ids } } }),
    // Children come after their parents in `ids`, so delete in reverse.
    ...[...ids].reverse().map((fid) => prisma.libraryFolder.delete({ where: { id: fid } })),
  ]);
  refresh();
  redirect(folder.parentId ? `/library/f/${folder.parentId}` : "/library");
}

// --- Documents ----------------------------------------------------------- //

const docSchema = z.object({
  title: z.string().trim().min(2, "Give it a title.").max(120),
  summary: z.string().trim().max(300).default(""),
  content: z.string().max(100000).default(""),
  clearance,
  folderId: optId,
  note: z.string().trim().max(200).default(""),
});

function parseDoc(data: FormData) {
  return docSchema.safeParse({
    title: data.get("title"),
    summary: String(data.get("summary") ?? ""),
    content: String(data.get("content") ?? ""),
    clearance: data.get("clearance"),
    folderId: data.get("folderId"),
    note: String(data.get("note") ?? ""),
  });
}

async function folderFor(me: Viewer, folderId: string | null) {
  if (!folderId) return { folder: null, error: null };
  const folder = await prisma.libraryFolder.findUnique({ where: { id: folderId } });
  if (!folder || !canRead(me, folder.clearance)) return { folder: null, error: "Folder not found." };
  return { folder, error: null };
}

export async function createDoc(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await authorOrThrow();
  const p = parseDoc(data);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const { folder, error } = await folderFor(me, p.data.folderId);
  if (error) return { error };
  const bad = checkClearance(me, p.data.clearance, folder?.clearance, "A document");
  if (bad) return { error: bad };
  const { note, ...fields } = p.data;
  const slug = await uniqueSlug(fields.title);
  await prisma.libraryDocument.create({
    data: {
      ...fields,
      slug,
      createdById: me.id,
      updatedById: me.id,
      revisions: {
        create: { number: 1, title: fields.title, summary: fields.summary, content: fields.content, note: note || "Created", authorId: me.id },
      },
    },
  });
  refresh();
  redirect(`/library/${slug}`);
}

export async function updateDoc(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await authorOrThrow();
  const id = String(data.get("id"));
  const p = parseDoc(data);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const prev = await prisma.libraryDocument.findUnique({ where: { id } });
  if (!prev || !canRead(me, prev.clearance)) return { error: "Document not found." };
  const { folder, error } = await folderFor(me, p.data.folderId);
  if (error) return { error };
  const bad = checkClearance(me, p.data.clearance, folder?.clearance, "A document");
  if (bad) return { error: bad };

  const { note, ...fields } = p.data;
  // A revision is kept whenever the text changes, not for a move or a
  // clearance change.
  const changed = prev.title !== fields.title || prev.summary !== fields.summary || prev.content !== fields.content;
  await prisma.libraryDocument.update({
    where: { id },
    data: {
      ...fields,
      updatedById: me.id,
      ...(changed && {
        revision: { increment: 1 },
        revisions: {
          create: {
            number: prev.revision + 1,
            title: fields.title,
            summary: fields.summary,
            content: fields.content,
            note: note || null,
            authorId: me.id,
          },
        },
      }),
    },
  });
  refresh();
  redirect(`/library/${prev.slug}`);
}

export async function deleteDoc(data: FormData) {
  const me = await getViewer();
  if (!canDelete(me)) throw new Error("You don't have permission to do that.");
  const doc = await prisma.libraryDocument.delete({ where: { id: String(data.get("id")) } });
  refresh();
  redirect(doc.folderId ? `/library/f/${doc.folderId}` : "/library");
}

// --- Revisions ----------------------------------------------------------- //

/** Restoring writes the old text as a new revision; history is never rewritten. */
export async function restoreRevision(data: FormData) {
  const me = await authorOrThrow();
  const id = String(data.get("id"));
  const number = Number(data.get("number"));
  const doc = await prisma.libraryDocument.findUnique({ where: { id } });
  if (!doc || !canRead(me, doc.clearance)) throw new Error("Document not found.");
  const old = await prisma.libraryRevision.findUnique({ where: { documentId_number: { documentId: id, number } } });
  if (!old) throw new Error("Revision not found.");
  await prisma.libraryDocument.update({
    where: { id },
    data: {
      title: old.title,
      summary: old.summary,
      content: old.content,
      updatedById: me.id,
      revision: { increment: 1 },
      revisions: {
        create: {
          number: doc.revision + 1,
          title: old.title,
          summary: old.summary,
          content: old.content,
          note: `Restored revision ${number}`,
          authorId: me.id,
        },
      },
    },
  });
  refresh();
  redirect(`/library/${doc.slug}`);
}
