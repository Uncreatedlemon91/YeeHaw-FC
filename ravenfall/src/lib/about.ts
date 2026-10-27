import { SQUADS } from "@/config/unit";
import { prisma } from "@/lib/prisma";

/** "team-leader-course" -> "Team Leader Course", for when the vault can't be read. */
export function prettySlug(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Vault titles for qualification slugs. Never throws: falls back to prettified slugs. */
export async function qualTitles(slugs: readonly string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = Object.fromEntries(slugs.map((s) => [s, prettySlug(s)]));
  try {
    const rows = await prisma.qualification.findMany({ where: { slug: { in: [...slugs] } }, select: { slug: true, title: true } });
    for (const r of rows) out[r.slug] = r.title;
  } catch {
    // Public page: keep the fallbacks.
  }
  return out;
}

export const squadCap = (billets: Record<string, number>) => Object.values(billets).reduce((a, b) => a + b, 0);

/** Active members per squad, as on the landing page. null when the DB is unavailable or empty. */
export async function squadStrength(): Promise<{ filled: Record<string, number>; members: number } | null> {
  try {
    const rows = await prisma.user.groupBy({ by: ["squad"], where: { status: "ACTIVE", squad: { not: null } }, _count: true });
    const filled: Record<string, number> = {};
    let members = 0;
    for (const r of rows) {
      if (!r.squad) continue;
      filled[r.squad] = Math.min(r._count, squadCap(SQUADS.find((s) => s.name === r.squad)?.billets ?? {}));
      members += r._count;
    }
    return members > 0 ? { filled, members } : null;
  } catch {
    return null;
  }
}
