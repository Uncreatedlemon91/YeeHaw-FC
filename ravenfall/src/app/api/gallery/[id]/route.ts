import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { imagePath } from "@/lib/library-images";
import { prisma } from "@/lib/prisma";

// Gallery images are public: they're on the home page.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.galleryItem.findUnique({ where: { id } });
  if (!item?.filename || !item.mime) return new NextResponse("Not found", { status: 404 });
  let bytes: Buffer;
  try {
    bytes = await readFile(imagePath(item.filename));
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": item.mime,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
