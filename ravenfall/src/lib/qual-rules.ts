import { rankIndex } from "@/config/unit";

// Qualification rules with no database: safe for client components (the
// builder's live preview) and server code alike.

export const BADGE_SHAPES = ["TAB", "SHIELD", "ROUND", "WINGS", "CROSS"] as const;
export type BadgeShape = (typeof BADGE_SHAPES)[number];
export const SHAPE_LABEL: Record<BadgeShape, string> = { TAB: "Tab", SHIELD: "Shield", ROUND: "Roundel", WINGS: "Wings", CROSS: "Cross" };

/** Each category's badge colour when the qualification doesn't set its own. */
export const CATEGORY_COLOR: Record<string, string> = {
  WEAPONS: "#7a1f1f",
  LEADERSHIP: "#1f3a7a",
  MEDICAL: "#a32020",
  PILOT: "#3b6fb5",
  GENERAL: "#4f6b2f",
};

export const MAX_TASKS = 25;
export const MAX_CODE = 4;

export const shapeOf = (s: string | null | undefined): BadgeShape => (BADGE_SHAPES.includes(s as BadgeShape) ? (s as BadgeShape) : "TAB");
export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);
export const badgeColor = (q: { badgeColor: string | null; category: string }) => (q.badgeColor && isHex(q.badgeColor) ? q.badgeColor : CATEGORY_COLOR[q.category] ?? CATEGORY_COLOR.GENERAL);

/** The badge's letters: given, or the title's initials ("Combat Lifesaver" -> "CL"). */
export function badgeCode(q: { badgeCode: string; title: string }): string {
  const given = q.badgeCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_CODE);
  if (given) return given;
  const words = q.title.split(/[\s/-]+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  return (words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "?").slice(0, 3)).toUpperCase().slice(0, MAX_CODE);
}

// --- Holding one --------------------------------------------------------- //

type Held = { expiresAt: Date | null; qualification: { slug: string } };

/** Held and in date. */
export const isCurrent = (h: { expiresAt: Date | null }, now = new Date()) => !h.expiresAt || h.expiresAt > now;

/** The slugs a member holds that still count (expired ones don't). */
export const heldSlugs = (held: readonly Held[], now = new Date()) => held.filter((h) => isCurrent(h, now)).map((h) => h.qualification.slug);

/** Due for recertification within this many days. */
export const EXPIRING_DAYS = 30;
export const expiringSoon = (h: { expiresAt: Date | null }, now = new Date()) =>
  !!h.expiresAt && h.expiresAt > now && h.expiresAt.getTime() - now.getTime() < EXPIRING_DAYS * 864e5;

export function expiryFor(validDays: number | null, from = new Date()): Date | null {
  return validDays ? new Date(from.getTime() + validDays * 864e5) : null;
}

/**
 * What stops a member being certified: prerequisites they don't hold
 * (current), or a rank below the minimum. Empty when they're eligible.
 */
export function blockers(
  q: { minRank: string | null; prerequisites: { slug: string; title: string }[] },
  member: { rank: string | null; held: readonly string[] },
  rankName: (abbr: string) => string,
): string[] {
  const out = q.prerequisites.filter((p) => !member.held.includes(p.slug)).map((p) => `Needs ${p.title} first`);
  if (q.minRank && rankIndex(member.rank) < rankIndex(q.minRank)) out.push(`Needs the rank of ${rankName(q.minRank)}`);
  return out;
}
