import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { prisma } from "./prisma";

// Library image storage: files on disk under LIBRARY_UPLOAD_DIR with random
// names, rows in LibraryImage. Access is decided in the serving route.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type ImageExt = keyof typeof TYPES;

/** The image type from its first bytes (never the client's claim), or null. */
export function sniffImage(b: Uint8Array): { ext: ImageExt; mime: string } | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", mime: TYPES.png };
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return { ext: "jpg", mime: TYPES.jpg };
  // RIFF....WEBP
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { ext: "webp", mime: TYPES.webp };
  return null;
}

function uploadDir() {
  return path.resolve(env.libraryUploadDir);
}

/** Absolute path of a stored file; the name must be one we generated. */
export function imagePath(filename: string): string {
  if (!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(filename)) throw new Error("Bad image filename.");
  return path.join(uploadDir(), filename);
}

/** Write an image to disk under a fresh random name and return the name. */
export async function writeImageFile(bytes: Uint8Array, kind: { ext: ImageExt }): Promise<string> {
  const filename = `${randomBytes(16).toString("hex")}.${kind.ext}`;
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(imagePath(filename), bytes, { flag: "wx" });
  return filename;
}

export async function storeImage(bytes: Uint8Array, kind: { ext: ImageExt; mime: string }, uploaderId: string) {
  const filename = await writeImageFile(bytes, kind);
  try {
    return await prisma.libraryImage.create({
      data: { filename, mime: kind.mime, size: bytes.length, uploaderId },
    });
  } catch (e) {
    await unlink(imagePath(filename)).catch(() => {});
    throw e;
  }
}

/** Remove files from disk; a missing file is fine. Call after the rows are gone. */
export async function removeImageFiles(filenames: string[]) {
  await Promise.all(
    filenames.map((f) =>
      unlink(imagePath(f)).catch((e) => {
        if (e?.code !== "ENOENT") console.error("Library image cleanup failed:", f, e);
      }),
    ),
  );
}

const REF = /\/api\/library\/images\/([A-Za-z0-9_-]+)/g;

/** Ids of the library images a Markdown body points at. */
export function referencedImageIds(content: string): string[] {
  return [...new Set([...content.matchAll(REF)].map((m) => m[1]))];
}

/**
 * Attach images referenced in `content` to the document. Only images nobody
 * has claimed yet are taken, so one document can't pull another's (possibly
 * stricter) image under its own clearance.
 */
export async function linkImages(documentId: string, content: string) {
  const ids = referencedImageIds(content);
  if (!ids.length) return;
  await prisma.libraryImage.updateMany({ where: { id: { in: ids }, documentId: null }, data: { documentId } });
}
