import type { AwardDevice, AwardKind } from "@prisma/client";
import { z } from "zod";

// Awards: ribbon stripes and automatic rules. Pure (no database), so the
// client-side editor and the server actions validate with the same code.

export const AWARD_KINDS: readonly AwardKind[] = ["MEDAL", "COMMENDATION", "UNIT_CITATION", "CAMPAIGN", "SERVICE"];

export const KIND_LABEL: Record<AwardKind, string> = {
  MEDAL: "Medal",
  SERVICE: "Service ribbon",
  CAMPAIGN: "Campaign ribbon",
  UNIT_CITATION: "Unit citation",
  COMMENDATION: "Commendation",
};

export const DEVICES: readonly AwardDevice[] = ["NONE", "OAK_LEAF", "STAR", "NUMERAL"];

export const DEVICE_LABEL: Record<AwardDevice, string> = {
  NONE: "None",
  OAK_LEAF: "Oak leaf per repeat",
  STAR: "Star per repeat",
  NUMERAL: "Numeral (times earned)",
};

/** Slugs that would collide with a /vault route. */
export const RESERVED_AWARD_SLUGS = new Set(["new", "qualifications"]);

// --- Ribbon -------------------------------------------------------------- //

export type Stripe = { color: string; width: number };

export const MAX_STRIPES = 15;
export const MAX_STRIPE_WIDTH = 20;
export const FALLBACK_STRIPES: Stripe[] = [{ color: "#6b7280", width: 1 }];

const stripeSchema = z.object({
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Stripe colours are #rrggbb.")
    .transform((c) => c.toLowerCase()),
  width: z.number().int("Stripe widths are whole units.").min(1, "A stripe is at least 1 unit wide.").max(MAX_STRIPE_WIDTH, `A stripe is at most ${MAX_STRIPE_WIDTH} units wide.`),
});

const ribbonSchema = z.array(stripeSchema).min(1, "A ribbon needs at least one stripe.").max(MAX_STRIPES, `A ribbon has at most ${MAX_STRIPES} stripes.`);

/** Checks untrusted ribbon data (form input, JSON column). */
export function validateStripes(raw: unknown): { ok: true; stripes: Stripe[] } | { ok: false; error: string } {
  const r = ribbonSchema.safeParse(raw);
  return r.success ? { ok: true, stripes: r.data } : { ok: false, error: r.error.issues[0]?.message ?? "Invalid ribbon." };
}

/** Stripes from the database, never throwing: a corrupt value draws a plain grey ribbon. */
export function stripesOf(raw: unknown): Stripe[] {
  const v = validateStripes(raw);
  return v.ok ? v.stripes : FALLBACK_STRIPES;
}

// --- Devices ------------------------------------------------------------- //

export type DeviceMark = { kind: "OAK_LEAF" | "STAR"; silver: boolean } | { kind: "NUMERAL"; value: number };

/**
 * What to draw on the ribbon for the member's `count` (>= 1) awards. Oak leaves
 * and stars follow the usual convention: one per repeat, a silver one standing
 * for five bronze. Too many to fit falls back to a numeral.
 */
export function deviceMarks(device: AwardDevice, count: number): DeviceMark[] {
  if (device === "NONE" || count < 2) return [];
  if (device === "NUMERAL") return [{ kind: "NUMERAL", value: count }];
  const extra = count - 1;
  const silver = Math.floor(extra / 5);
  const bronze = extra % 5;
  if (silver + bronze > 5) return [{ kind: "NUMERAL", value: count }];
  return [
    ...Array.from({ length: silver }, () => ({ kind: device, silver: true }) as DeviceMark),
    ...Array.from({ length: bronze }, () => ({ kind: device, silver: false }) as DeviceMark),
  ];
}

// --- Automatic rules ----------------------------------------------------- //

export const RULE_TYPES = ["service_days", "ops_attended", "campaign", "good_conduct"] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const RULE_LABEL: Record<RuleType, string> = {
  service_days: "Days of service",
  ops_attended: "Operations attended",
  campaign: "Campaign tag",
  good_conduct: "Good conduct (clean days)",
};

const count = (what: string) => z.number().int(`${what} must be a whole number.`).min(1, `${what} must be at least 1.`).max(100000, `${what} is too large.`);

export const autoRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("service_days"), threshold: count("Days") }),
  z.object({ type: z.literal("ops_attended"), threshold: count("Operations"), every: count("Repeat interval").optional() }),
  z.object({ type: z.literal("campaign"), tag: z.string().trim().min(1, "Give the campaign tag.").max(60) }),
  z.object({ type: z.literal("good_conduct"), days: count("Days") }),
]);

export type AutoRule = z.infer<typeof autoRuleSchema>;

/** An award's stored rule, or null when absent or no longer valid. */
export function ruleOf(raw: unknown): AutoRule | null {
  const r = autoRuleSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** One line for the catalog and the editor. */
export function describeRule(rule: AutoRule): string {
  switch (rule.type) {
    case "service_days":
      return `Automatic: ${rule.threshold} days since enlistment`;
    case "ops_attended":
      return `Automatic: ${rule.threshold} operations attended${rule.every ? `, then every ${rule.every} more` : ""}`;
    case "campaign":
      return `Automatic: attended an operation tagged "${rule.tag}"`;
    case "good_conduct":
      return `Automatic: ${rule.days} days of clean service`;
  }
}

/** Where an award's medal art is served; `v` changes with the file, so a replaced image isn't stale. */
export function medalUrl(award: { id: string; medalFile: string | null }): string | null {
  return award.medalFile ? `/api/awards/${award.id}/medal?v=${award.medalFile.slice(0, 8)}` : null;
}

// --- Rack ---------------------------------------------------------------- //

export const RACK_ROW = 3;

/**
 * Lays ribbons (already in precedence order) out in rows of three. Real racks
 * wear the senior ribbon top-left and read left to right, top to bottom; an
 * incomplete row is the top one and is centred over the full rows below. So the
 * first `n % 3` ribbons form the short top row and the rest fill rows of three.
 */
export function rackRows<T>(items: readonly T[]): T[][] {
  const short = items.length % RACK_ROW;
  const rows: T[][] = short ? [items.slice(0, short)] : [];
  for (let i = short; i < items.length; i += RACK_ROW) rows.push(items.slice(i, i + RACK_ROW));
  return rows;
}

/**
 * Collapses a member's held awards (any order, revoked ones already removed)
 * to one entry per award, by precedence. The count is the number of rows held,
 * never max(sequence): revoked repeats leave gaps in the sequence. Devices only
 * apply to repeatable awards.
 */
export function groupHeld<R extends { awardedAt: Date; award: { id: string; precedence: number; repeatable: boolean } }>(rows: readonly R[]) {
  const by = new Map<string, { award: R["award"]; count: number; latest: R }>();
  for (const r of rows) {
    const g = by.get(r.award.id);
    if (!g) by.set(r.award.id, { award: r.award, count: 1, latest: r });
    else {
      g.count++;
      if (r.awardedAt > g.latest.awardedAt) g.latest = r;
    }
  }
  return [...by.values()]
    .map((g) => ({ ...g, count: g.award.repeatable ? g.count : 1 }))
    .sort((a, b) => a.award.precedence - b.award.precedence);
}
