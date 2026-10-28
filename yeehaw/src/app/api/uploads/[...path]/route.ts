import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { coverPath, MIME_BY_EXT } from "@/lib/news-images";

// Serves uploaded files from UPLOAD_DIR. Only article covers for now
// (/api/uploads/articles/<file>), which are public like the articles they
// head. The file name is checked against what we generate before any disk
// access, so no path can walk out of the directory.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const [kind, file, ...rest] = (await params).path;
  if (kind !== "articles" || !file || rest.length) return new NextResponse("Not found", { status: 404 });
  let bytes: Buffer;
  let ext: string;
  try {
    const p = coverPath(file);
    ext = p.slice(p.lastIndexOf(".") + 1);
    bytes = await readFile(p);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext],
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // A file name never changes content.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
