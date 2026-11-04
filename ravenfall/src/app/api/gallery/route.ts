import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { storeGalleryImage } from "@/lib/gallery";
import { MAX_IMAGE_BYTES, sniffImage } from "@/lib/library-images";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Screenshot upload for the public gallery (/admin/media). Recruiters and
// Command. The type comes from the file's magic bytes, never its name.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me || !hasPerm(me.perms, "RECRUITER")) return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) return NextResponse.json({ error: "Images can be up to 5 MB." }, { status: 413 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Images can be up to 5 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return NextResponse.json({ error: "Only PNG, JPG or WebP images." }, { status: 415 });

  const caption = String(form?.get("caption") ?? "").trim().slice(0, 200);
  const eventId = String(form?.get("eventId") ?? "") || null;
  if (eventId && !(await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } }))) return NextResponse.json({ error: "That operation no longer exists." }, { status: 400 });

  const item = await storeGalleryImage({ bytes, kind, caption, eventId, uploaderId: me.id });
  revalidatePath("/");
  return NextResponse.json({ id: item.id });
}
