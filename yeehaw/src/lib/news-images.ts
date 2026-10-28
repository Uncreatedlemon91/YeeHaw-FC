import { randomBytes } from "node:crypto";
import type SharpFn from "sharp";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

// Article cover images: files under UPLOAD_DIR/articles with random names,
// served by /api/uploads/[...path]. Port of proclubs/images.py, which kept two
// WebP sizes per upload (a display size for the article, a thumbnail for the
// cards) as data URIs in SQLite; here they are files, so browsers cache them.
// Re-encoding also drops EXIF (phone photos carry GPS tags) and applies
// rotation. sharp comes with Next; if it can't load, the original is stored
// as is, so an upload never fails over it.

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const DISPLAY_EDGE = 1600;
const THUMB_EDGE = 480;

const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type ImageExt = keyof typeof TYPES;
export const MIME_BY_EXT: Record<string, string> = TYPES;

/** The image type from its first bytes (never the client's claim), or null. */
export function sniffImage(b: Uint8Array): ImageExt | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  return null;
}

const dir = () => path.resolve(env.uploadDir, "articles");

/** Absolute path of a stored cover; the name must be one we generated. */
export function coverPath(file: string): string {
  if (!/^[a-f0-9]{32}(-thumb)?\.(png|jpg|webp)$/.test(file)) throw new Error("Bad image filename.");
  return path.join(dir(), file);
}

/** Store an uploaded cover (display + thumbnail). Returns the two file names. */
export async function storeCover(bytes: Uint8Array): Promise<{ file: string; thumb: string }> {
  const ext = sniffImage(bytes);
  if (!ext) throw new Error("That file isn't a PNG, JPEG or WebP image.");
  const id = randomBytes(16).toString("hex");
  await mkdir(dir(), { recursive: true });
  let sharp: typeof SharpFn | null = null;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    sharp = null;
  }
  if (!sharp) {
    await writeFile(path.join(dir(), `${id}.${ext}`), bytes, { flag: "wx" });
    return { file: `${id}.${ext}`, thumb: `${id}.${ext}` };
  }
  try {
    const base = () => sharp(bytes, { limitInputPixels: 50_000_000 }).rotate();
    const [display, thumb] = await Promise.all([
      base().resize(DISPLAY_EDGE, DISPLAY_EDGE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
      base().resize(THUMB_EDGE, THUMB_EDGE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(),
    ]);
    await writeFile(path.join(dir(), `${id}.webp`), display, { flag: "wx" });
    await writeFile(path.join(dir(), `${id}-thumb.webp`), thumb, { flag: "wx" });
    return { file: `${id}.webp`, thumb: `${id}-thumb.webp` };
  } catch {
    throw new Error("That image couldn't be read.");
  }
}

/** Remove cover files; a missing file is fine. */
export async function removeCover(...files: (string | null | undefined)[]) {
  await Promise.all(
    [...new Set(files.filter((f): f is string => !!f))].map((f) =>
      unlink(coverPath(f)).catch((e) => {
        if (e?.code !== "ENOENT") console.error("Cover cleanup failed:", f, e);
      }),
    ),
  );
}
