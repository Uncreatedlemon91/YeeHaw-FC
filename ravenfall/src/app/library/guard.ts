import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { allFolders, canRead, folderChain, getViewer } from "@/lib/library";
import { prisma } from "@/lib/prisma";

/** A document's history pages are for authors who are cleared for the document. */
export async function historyDoc(slug: string, path: string) {
  await requireUser("INSTRUCTOR", path);
  const viewer = (await getViewer())!;
  const doc = await prisma.libraryDocument.findUnique({ where: { slug } });
  if (!doc || !canRead(viewer, doc.clearance)) notFound();
  return { doc, viewer, chain: folderChain(await allFolders(), doc.folderId) };
}
