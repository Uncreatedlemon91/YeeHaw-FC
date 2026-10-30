import { readFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { MAX_IMAGE_BYTES, imagePath, removeImageFiles, sniffImage, writeImageFile } from "@/lib/library-images";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Medal art for an award. Reading is public, like the catalog; uploading and
// removing are ADMIN. The type comes from the file's magic bytes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const award = await prisma.award.findUnique({ where: { id }, select: { medalFile: true, medalMime: true } });
  if (!award?.medalFile || !award.medalMime) return new NextResponse("Not found", { status: 404 });
  let bytes: Buffer;
  try {
    bytes = await readFile(imagePath(award.medalFile));
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": award.medalMime,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=300",
    },
  });
}

async function adminOr403() {
  const user = await getSessionUser();
  return user && hasPerm(user.perms, "ADMIN") ? user : null;
}

function refresh(slug: string) {
  revalidatePath("/vault");
  revalidatePath(`/vault/${slug}`);
  revalidatePath(`/admin/awards/${slug}`);
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await adminOr403();
  if (!user) return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  const { id } = await params;
  const award = await prisma.award.findUnique({ where: { id }, select: { slug: true, medalFile: true } });
  if (!award) return NextResponse.json({ error: "Award not found." }, { status: 404 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) return NextResponse.json({ error: "Images can be up to 5 MB." }, { status: 413 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Images can be up to 5 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return NextResponse.json({ error: "Only PNG, JPG or WebP images." }, { status: 415 });

  const filename = await writeImageFile(bytes, kind);
  try {
    await prisma.award.update({ where: { id }, data: { medalFile: filename, medalMime: kind.mime, medalById: user.id } });
  } catch (e) {
    await removeImageFiles([filename]);
    throw e;
  }
  if (award.medalFile) await removeImageFiles([award.medalFile]);
  refresh(award.slug);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Ctx) {
  if (!(await adminOr403())) return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  const { id } = await params;
  const award = await prisma.award.findUnique({ where: { id }, select: { slug: true, medalFile: true } });
  if (!award) return NextResponse.json({ error: "Award not found." }, { status: 404 });
  await prisma.award.update({ where: { id }, data: { medalFile: null, medalMime: null, medalById: null } });
  if (award.medalFile) await removeImageFiles([award.medalFile]);
  refresh(award.slug);
  return NextResponse.json({ ok: true });
}
