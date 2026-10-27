import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { canAuthor, canRead, getViewer } from "@/lib/library";
import { imagePath } from "@/lib/library-images";
import { prisma } from "@/lib/prisma";

// Serves a library image after the same clearance check as its document.
// An image attached to a document follows that document's clearance; one not
// attached to anything yet (just uploaded in the editor) is for authors.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await prisma.libraryImage.findUnique({
    where: { id },
    include: { document: { select: { clearance: true } } },
  });
  if (!image) return new NextResponse("Not found", { status: 404 });

  const viewer = await getViewer();
  const allowed = image.document ? canRead(viewer, image.document.clearance) : canAuthor(viewer);
  // 404 rather than 403 so a hidden image's existence isn't confirmed.
  if (!allowed) return new NextResponse("Not found", { status: viewer ? 404 : 401 });

  let bytes: Buffer;
  try {
    bytes = await readFile(imagePath(image.filename));
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const publicDoc = image.document?.clearance === "PUBLIC";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // Filenames never change content, so the bytes are immutable; private
      // keeps clearance-gated images out of shared caches.
      "Cache-Control": publicDoc ? "public, max-age=300" : "private, max-age=3600",
    },
  });
}
