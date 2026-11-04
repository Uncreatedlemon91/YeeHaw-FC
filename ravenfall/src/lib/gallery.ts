import { unlink } from "node:fs/promises";
import { UNIT } from "@/config/unit";
import { imagePath, type ImageExt, writeImageFile } from "./library-images";
import { prisma } from "./prisma";

// The public home page's "From the field" gallery. Screenshots are stored
// like library images (random names on disk) but are always public, served
// by /api/gallery/<id>; videos are YouTube ids, played click-to-load.
// Recruiters and Command manage it at /admin/media.

/** The YouTube id from a watch, share, shorts or embed URL, or a bare id. */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export async function storeGalleryImage(opts: { bytes: Uint8Array; kind: { ext: ImageExt; mime: string }; caption: string; eventId: string | null; uploaderId: string }) {
  const filename = await writeImageFile(opts.bytes, opts.kind);
  try {
    return await prisma.galleryItem.create({
      data: { kind: "IMAGE", filename, mime: opts.kind.mime, size: opts.bytes.length, caption: opts.caption, eventId: opts.eventId, uploaderId: opts.uploaderId },
    });
  } catch (e) {
    await unlink(imagePath(filename)).catch(() => {});
    throw e;
  }
}

export async function deleteGalleryItem(id: string) {
  const gone = await prisma.galleryItem.delete({ where: { id } });
  if (gone.filename) await unlink(imagePath(gone.filename)).catch((e) => e?.code !== "ENOENT" && console.error("Gallery cleanup failed:", gone.filename, e));
}

export type PublicMedia = { images: { id: string; src: string; caption: string; event: string | null }[]; videos: { id: string; caption: string }[] };

/** What the home page shows: the gallery, plus any videos still listed in src/config/unit.ts. */
export async function publicMedia(take = 12): Promise<PublicMedia> {
  const items = await prisma.galleryItem.findMany({ orderBy: { createdAt: "desc" }, take: take * 2, include: { event: { select: { title: true } } } });
  const images = items
    .filter((i) => i.kind === "IMAGE")
    .slice(0, take)
    .map((i) => ({ id: i.id, src: `/api/gallery/${i.id}`, caption: i.caption, event: i.event?.title ?? null }));
  const videos = [
    ...items.filter((i) => i.kind === "VIDEO" && i.youtubeId).map((i) => ({ id: i.youtubeId!, caption: i.caption || i.event?.title || "" })),
    ...UNIT.media.map((id) => ({ id, caption: "" })),
  ];
  const seen = new Set<string>();
  return { images, videos: videos.filter((v) => !seen.has(v.id) && seen.add(v.id)).slice(0, 4) };
}
