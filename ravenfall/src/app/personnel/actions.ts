"use server";

import type { RequestType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { MAX_SECONDARY_ROLES, WEEKDAYS } from "@/config/unit";
import { assertPerm } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CALLSIGN_RE } from "@/lib/recruitment";
import {
  billetFill,
  checkInterest,
  checkRoleChange,
  decideRequest,
  endOfDay,
  type InterestPayload,
  missingQuals,
  postRequest,
  refreshBoard,
  type RolePayload,
} from "@/lib/personnel";
import { fromInput } from "@/lib/time";

const text = (v: FormDataEntryValue | null, max: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

function refresh(userId: string) {
  revalidatePath(`/roster/${userId}`);
  revalidatePath("/personnel");
  revalidatePath("/roster");
  revalidatePath("/dashboard");
  revalidatePath("/about/billets");
}

// --- The member's own file ----------------------------------------------- //

export async function updateOwnProfile(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("OPERATOR");
  const days = data.getAll("availability").map(String).filter((d) => (WEEKDAYS as readonly string[]).includes(d));
  await prisma.user.update({
    where: { id: me.id },
    data: {
      bio: text(data.get("bio"), 1000),
      timezone: text(data.get("timezone"), 60),
      loadout: text(data.get("loadout"), 300),
      availability: WEEKDAYS.filter((d) => days.includes(d)),
    },
  });
  refresh(me.id);
  return { ok: "File updated." };
}

// --- Filing requests ----------------------------------------------------- //

async function file(userId: string, type: RequestType, fields: { payload?: object; startDate?: Date; endDate?: Date; reason: string | null }) {
  const open = await prisma.personnelRequest.findFirst({ where: { userId, type, status: "PENDING" } });
  if (open) return { error: "You already have one of these pending. Withdraw it first to file a new one." };
  const req = await prisma.personnelRequest.create({ data: { userId, type, ...fields } });
  const warning = await postRequest(req.id);
  refresh(userId);
  return { ok: "Request filed. Leadership has been notified.", warnings: warning ? [warning] : [] };
}

export async function requestRole(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("OPERATOR");
  const member = await prisma.user.findUniqueOrThrow({
    where: { id: me.id },
    include: { qualifications: { include: { qualification: true } } },
  });
  if (member.status !== "ACTIVE") return { error: "Only active members can request a billet." };
  const want: RolePayload = {
    squad: String(data.get("squad") ?? ""),
    primary: String(data.get("primary") ?? ""),
    secondary: [...new Set(data.getAll("secondary").map(String).filter(Boolean))].slice(0, MAX_SECONDARY_ROLES + 1),
  };
  if (
    want.squad === member.squad &&
    want.primary === member.unitRole &&
    [...want.secondary].sort().join() === [...member.secondaryRoles].sort().join()
  )
    return { error: "That's the billet you already hold." };
  const held = member.qualifications.map((q) => q.qualification.slug);
  const err = checkRoleChange(member, held, want, await billetFill());
  if (err) return { error: err };
  return file(me.id, "ROLE", { payload: want, reason: text(data.get("reason"), 500) });
}

/** Cap on open interests, so nobody volunteers for every slot at once. */
const MAX_OPEN_INTERESTS = 3;

/**
 * Volunteer for a vacant billet, qualified or not. S1 approves (seating a
 * qualified member, or selecting one who still needs training) or denies.
 */
export async function expressInterest(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("OPERATOR");
  const member = await prisma.user.findUniqueOrThrow({
    where: { id: me.id },
    include: { qualifications: { include: { qualification: true } } },
  });
  if (member.status !== "ACTIVE") return { error: "Only active members can volunteer for a billet." };
  const squad = String(data.get("squad") ?? "");
  const role = String(data.get("role") ?? "");
  const err = checkInterest(member, squad, role, await billetFill());
  if (err) return { error: err };
  const open = (await prisma.personnelRequest.findMany({ where: { userId: me.id, type: "INTEREST", status: "PENDING" } })).map(
    (r) => r.payload as InterestPayload,
  );
  if (open.some((p) => p.squad === squad && p.role === role)) return { error: "You've already put your name in for that billet." };
  if (open.length >= MAX_OPEN_INTERESTS) return { error: `Up to ${MAX_OPEN_INTERESTS} open interests at a time. Withdraw one from your file first.` };
  const missing = missingQuals(role, member.qualifications.map((q) => q.qualification.slug));
  const titles = await prisma.qualification.findMany({ where: { slug: { in: missing } }, select: { slug: true, title: true } });
  const payload: InterestPayload = { squad, role, needs: missing.map((m) => titles.find((t) => t.slug === m)?.title ?? m) };
  const req = await prisma.personnelRequest.create({
    data: { userId: me.id, type: "INTEREST", payload, reason: text(data.get("reason"), 500) },
  });
  const warning = await postRequest(req.id);
  refresh(me.id);
  return { ok: `Interest in ${squad} · ${role} filed. S1 has been notified.`, warnings: warning ? [warning] : [] };
}

export async function requestCallsign(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("OPERATOR");
  const callsign = String(data.get("callsign") ?? "").trim();
  if (!CALLSIGN_RE.test(callsign)) return { error: "Callsign: 2–24 letters, numbers, spaces or hyphens." };
  const taken = await prisma.user.findFirst({ where: { callsign: { equals: callsign, mode: "insensitive" } } });
  if (taken) return { error: taken.id === me.id ? "That's already your callsign." : `"${callsign}" is already in use.` };
  return file(me.id, "CALLSIGN", { payload: { callsign }, reason: text(data.get("reason"), 500) });
}

const leaveSchema = z
  .object({ start: z.date(), end: z.date(), reason: z.string().trim().min(3, "Give leadership a short reason.").max(500) })
  .refine((v) => v.end >= v.start, "The leave must end on or after the day it starts.")
  .refine((v) => v.end.getTime() - v.start.getTime() <= 180 * 864e5, "Leave is capped at 180 days; talk to Command for longer.");

export async function requestLeave(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("OPERATOR");
  const start = fromInput(`${data.get("start")}T00:00`);
  const end = fromInput(`${data.get("end")}T00:00`);
  if (!start || !end) return { error: "Pick the first and last day of your leave." };
  const parsed = leaveSchema.safeParse({ start, end, reason: data.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (endOfDay(end) < new Date()) return { error: "That leave has already ended." };
  return file(me.id, "LOA", { startDate: start, endDate: endOfDay(end), reason: parsed.data.reason });
}

export async function cancelRequest(data: FormData) {
  const me = await assertPerm("OPERATOR");
  const id = String(data.get("requestId"));
  const done = await prisma.personnelRequest.updateMany({
    where: { id, userId: me.id, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });
  if (done.count) await refreshBoard(id).catch(() => {});
  refresh(me.id);
}

/** End an approved leave early: the member is back. */
export async function endLeave(data: FormData) {
  const me = await assertPerm("OPERATOR");
  const id = String(data.get("requestId"));
  const req = await prisma.personnelRequest.findFirst({ where: { id, userId: me.id, type: "LOA", status: "APPROVED" } });
  if (!req || !req.endDate || req.endDate < new Date()) return;
  await prisma.$transaction([
    prisma.personnelRequest.update({ where: { id }, data: { endDate: new Date() } }),
    prisma.serviceRecord.create({ data: { userId: me.id, type: "NOTE", title: "Returned from leave" } }),
  ]);
  refresh(me.id);
}

// --- Deciding ------------------------------------------------------------ //

export async function decide(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("OPERATOR");
  const result = await decideRequest({
    requestId: String(data.get("requestId")),
    approve: data.get("verdict") === "approve",
    reviewer: me,
    reviewerName: me.name,
    note: text(data.get("note"), 500),
  });
  const req = await prisma.personnelRequest.findUnique({ where: { id: String(data.get("requestId")) } });
  if (req) refresh(req.userId);
  return result.ok ? { ok: result.message, warnings: result.warnings } : { error: result.error };
}
