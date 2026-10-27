import { NextResponse } from "next/server";
import { canAuthor, getViewer } from "@/lib/library";
import { MAX_IMAGE_BYTES, sniffImage, storeImage } from "@/lib/library-images";

// Image upload for the library editor. INSTRUCTOR and above; the type is
// decided from the file's magic bytes, not its name or declared MIME.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer || !canAuthor(viewer)) return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  // Slack for the multipart envelope; the file itself is checked below.
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) return NextResponse.json({ error: "Images can be up to 5 MB." }, { status: 413 });

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Images can be up to 5 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return NextResponse.json({ error: "Only PNG, JPG or WebP images." }, { status: 415 });

  const image = await storeImage(bytes, kind, viewer.id);
  return NextResponse.json({ id: image.id, url: `/api/library/images/${image.id}` });
}
