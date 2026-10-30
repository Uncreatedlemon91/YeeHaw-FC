"use server";

import { Prisma, type AwardDevice, type AwardKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { autoRuleSchema, AWARD_KINDS, DEVICES, RESERVED_AWARD_SLUGS, validateStripes, type AutoRule } from "@/lib/awards";
import { assertPerm } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

// Award catalog editing. ADMIN only, checked on every action.

const schema = z.object({
  name: z.string().trim().min(2, "Give it a name.").max(80),
  kind: z.enum(AWARD_KINDS as [AwardKind, ...AwardKind[]]),
  precedence: z.coerce.number({ message: "Precedence is a number." }).int("Precedence is a whole number.").min(1).max(100000),
  description: z.string().trim().max(300).default(""),
  criteria: z.string().max(10000).default(""),
  repeatable: z.boolean(),
  device: z.enum(DEVICES as [AwardDevice, ...AwardDevice[]]),
});

function refresh(slug?: string) {
  revalidatePath("/vault");
  revalidatePath("/admin/awards");
  if (slug) {
    revalidatePath(`/vault/${slug}`);
    revalidatePath(`/admin/awards/${slug}`);
  }
}

/** The number from a form field, or NaN when blank / not numeric. */
function num(data: FormData, key: string) {
  const v = String(data.get(key) ?? "").trim();
  return v === "" ? NaN : Number(v);
}

/** Auto rule fields: ruleType ("" = decided by nomination) plus the fields that type uses. */
function parseRule(data: FormData): { rule: AutoRule | null } | { error: string } {
  const type = String(data.get("ruleType") ?? "");
  if (!type) return { rule: null };
  const every = num(data, "ruleEvery");
  const raw =
    type === "service_days"
      ? { type, threshold: num(data, "ruleThreshold") }
      : type === "ops_attended"
        ? { type, threshold: num(data, "ruleThreshold"), ...(Number.isNaN(every) ? {} : { every }) }
        : type === "campaign"
          ? { type, tag: String(data.get("ruleTag") ?? "") }
          : type === "good_conduct"
            ? { type, days: num(data, "ruleDays") }
            : null;
  if (!raw) return { error: "Pick an automatic rule type." };
  const r = autoRuleSchema.safeParse(raw);
  return r.success ? { rule: r.data } : { error: r.error.issues[0]?.message ?? "Invalid automatic rule." };
}

function parse(data: FormData) {
  const p = schema.safeParse({
    name: data.get("name"),
    kind: data.get("kind"),
    precedence: data.get("precedence"),
    description: String(data.get("description") ?? ""),
    criteria: String(data.get("criteria") ?? ""),
    repeatable: data.get("repeatable") === "on",
    device: data.get("device"),
  });
  if (!p.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of p.error.issues) {
      const k = String(i.path[0] ?? "");
      if (k && !fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { error: "Fix the highlighted fields.", fieldErrors } satisfies ActionState;
  }
  let ribbonRaw: unknown;
  try {
    ribbonRaw = JSON.parse(String(data.get("ribbon") ?? "[]"));
  } catch {
    return { error: "The ribbon didn't come through. Reload and try again." } satisfies ActionState;
  }
  const ribbon = validateStripes(ribbonRaw);
  if (!ribbon.ok) return { error: ribbon.error, fieldErrors: { ribbon: ribbon.error } } satisfies ActionState;
  const rule = parseRule(data);
  if ("error" in rule) return { error: rule.error, fieldErrors: { rule: rule.error } } satisfies ActionState;
  const fields = p.data;
  // A repeat has to show somewhere, and a repeating rule has to be allowed to repeat.
  if (!fields.repeatable && fields.device !== "NONE") return { error: "Only a repeatable award can have a device.", fieldErrors: { device: "Turn on Repeatable, or pick no device." } } satisfies ActionState;
  if (!fields.repeatable && rule.rule?.type === "ops_attended" && rule.rule.every) return { error: "A repeating rule needs Repeatable switched on.", fieldErrors: { rule: "Turn on Repeatable, or clear the repeat interval." } } satisfies ActionState;
  return { fields, ribbon: ribbon.stripes, rule: rule.rule };
}

async function freeSlug(name: string) {
  const base = slugify(name) || "award";
  const taken = async (s: string) =>
    RESERVED_AWARD_SLUGS.has(s) || !!(await prisma.award.findUnique({ where: { slug: s }, select: { id: true } }));
  let slug = base;
  for (let n = 2; await taken(slug); n++) slug = `${base}-${n}`;
  return slug;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function createAward(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("ADMIN");
  const p = parse(data);
  if ("error" in p) return p;
  const slug = await freeSlug(p.fields.name);
  await prisma.award.create({
    data: { ...p.fields, slug, ribbon: json(p.ribbon), autoRule: p.rule ? json(p.rule) : undefined },
  });
  refresh(slug);
  redirect(`/admin/awards/${slug}`);
}

export async function updateAward(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("ADMIN");
  const id = String(data.get("id"));
  const p = parse(data);
  if ("error" in p) return p;
  const prev = await prisma.award.findUnique({ where: { id } });
  if (!prev) return { error: "Award not found." };
  await prisma.award.update({
    where: { id },
    data: { ...p.fields, ribbon: json(p.ribbon), autoRule: p.rule ? json(p.rule) : Prisma.DbNull },
  });
  refresh(prev.slug);
  return { ok: "Saved." };
}

/** Retire an award (hidden from the catalog, kept on existing racks) or bring it back. */
export async function setAwardActive(data: FormData) {
  await assertPerm("ADMIN");
  const award = await prisma.award.update({ where: { id: String(data.get("id")) }, data: { active: data.get("active") === "true" } });
  refresh(award.slug);
}

/** Swap an award with its neighbour in precedence order, renumbering to tidy steps of 10. */
export async function moveAward(data: FormData) {
  await assertPerm("ADMIN");
  const id = String(data.get("id"));
  const dir = data.get("dir") === "up" ? -1 : 1;
  const all = await prisma.award.findMany({ orderBy: [{ precedence: "asc" }, { name: "asc" }], select: { id: true } });
  const i = all.findIndex((a) => a.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((a, n) => prisma.award.update({ where: { id: a.id }, data: { precedence: (n + 1) * 10 } })));
  refresh();
}
