"use server";

import type { MemberStatus, ServiceRecordType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { nickname, RANKS, rankIndex, rankName, SQUADS, UNIT_ROLES } from "@/config/unit";
import { assertPerm } from "@/lib/auth";
import { explain, setNickname } from "@/lib/discord";
import { env } from "@/lib/env";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { CALLSIGN_RE } from "@/lib/recruitment";

const opt = (s: FormDataEntryValue | null) => {
  const v = String(s ?? "").trim();
  return v === "" ? null : v;
};

const profileSchema = z.object({
  callsign: z.string().regex(CALLSIGN_RE, "Callsign: 2–24 letters, numbers, spaces or hyphens.").nullable(),
  rank: z.enum(RANKS.map((r) => r.abbr) as [string, ...string[]]).nullable(),
  squad: z.enum(SQUADS.map((s) => s.name) as [string, ...string[]]).nullable(),
  unitRole: z.enum(UNIT_ROLES as [string, ...string[]]).nullable(),
  status: z.enum(["CANDIDATE", "ACTIVE", "INACTIVE", "DISCHARGED"]),
});

// Editing a profile writes the service record for you: a rank change is a
// promotion (or reduction), a squad / role change is a transfer, and a
// discharge is a discharge.
export async function updateProfile(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("ADMIN");
  const userId = String(data.get("userId"));
  const parsed = profileSchema.safeParse({
    callsign: opt(data.get("callsign")),
    rank: opt(data.get("rank")),
    squad: opt(data.get("squad")),
    unitRole: opt(data.get("unitRole")),
    status: data.get("status"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const next = parsed.data;
  const prev = await prisma.user.findUnique({ where: { id: userId } });
  if (!prev) return { error: "Member not found." };

  if (next.callsign && next.callsign.toLowerCase() !== prev.callsign?.toLowerCase()) {
    const taken = await prisma.user.findFirst({
      where: { callsign: { equals: next.callsign, mode: "insensitive" }, NOT: { id: userId } },
    });
    if (taken) return { error: `Callsign "${next.callsign}" is already in use.` };
  }

  const records: { type: ServiceRecordType; title: string; description?: string }[] = [];
  if (next.rank !== prev.rank && next.rank) {
    const up = rankIndex(next.rank) > rankIndex(prev.rank);
    records.push({
      type: up ? "PROMOTION" : "NOTE",
      title: up ? `Promoted to ${rankName(next.rank)}` : `Reduced in rank to ${rankName(next.rank)}`,
      description: prev.rank ? `From ${rankName(prev.rank)}.` : undefined,
    });
  }
  if ((next.squad !== prev.squad && next.squad) || (next.unitRole !== prev.unitRole && next.unitRole)) {
    const parts = [next.squad, next.unitRole].filter(Boolean).join(", ");
    records.push({
      type: "TRANSFER",
      title: `Assigned to ${parts}`,
      description: [prev.squad, prev.unitRole].some(Boolean)
        ? `Previously ${[prev.squad, prev.unitRole].filter(Boolean).join(", ")}.`
        : undefined,
    });
  }
  if (next.status !== prev.status && next.status === "DISCHARGED") {
    records.push({ type: "DISCHARGE", title: "Discharged" });
  }
  if (next.status !== prev.status && next.status === "ACTIVE" && prev.status !== "CANDIDATE") {
    records.push({ type: "NOTE", title: "Returned to active status" });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        ...next,
        status: next.status as MemberStatus,
        enlistedAt: next.status === "ACTIVE" && !prev.enlistedAt ? new Date() : undefined,
      },
    }),
    ...records.map((r) => prisma.serviceRecord.create({ data: { ...r, userId, issuedById: me.id } })),
  ]);

  const warnings: string[] = [];
  if ((next.rank !== prev.rank || next.callsign !== prev.callsign) && next.callsign && env.botToken) {
    try {
      await setNickname(prev.discordId, nickname(next.rank, next.callsign), `Profile updated by ${me.name}`);
    } catch (e) {
      warnings.push(`Discord nickname: ${explain(e)}`);
    }
  }
  revalidatePath(`/roster/${userId}`);
  revalidatePath("/roster");
  return { ok: records.length ? `Saved. Added ${records.length} service record entr${records.length === 1 ? "y" : "ies"}.` : "Saved.", warnings };
}

const MANUAL_TYPES: ServiceRecordType[] = ["ENLISTMENT", "PROMOTION", "AWARD", "DISCIPLINARY", "TRANSFER", "DISCHARGE", "NOTE"];

export async function addRecord(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("RECRUITER");
  const type = String(data.get("type")) as ServiceRecordType;
  // Recruiters log enlistments and notes; everything else is Command's call.
  const allowed = hasPerm(me.perms, "ADMIN") ? MANUAL_TYPES : (["ENLISTMENT", "NOTE"] as ServiceRecordType[]);
  if (!allowed.includes(type)) return { error: "You can't add that type of entry." };
  const title = String(data.get("title") ?? "").trim();
  if (!title || title.length > 120) return { error: "Give the entry a title (up to 120 characters)." };
  const userId = String(data.get("userId"));
  await prisma.serviceRecord.create({
    data: { userId, type, title, description: opt(data.get("description")), issuedById: me.id },
  });
  revalidatePath(`/roster/${userId}`);
  return { ok: "Entry added." };
}

export async function deleteRecord(data: FormData) {
  await assertPerm("ADMIN");
  const rec = await prisma.serviceRecord.delete({ where: { id: String(data.get("recordId")) } });
  revalidatePath(`/roster/${rec.userId}`);
}

export async function awardQualification(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("INSTRUCTOR");
  const userId = String(data.get("userId"));
  const qualificationId = String(data.get("qualificationId"));
  const qual = await prisma.qualification.findUnique({ where: { id: qualificationId } });
  if (!qual) return { error: "Pick a qualification." };
  const exists = await prisma.userQualification.findUnique({
    where: { userId_qualificationId: { userId, qualificationId } },
  });
  if (exists) return { error: "They already hold that qualification." };
  await prisma.$transaction([
    prisma.userQualification.create({ data: { userId, qualificationId, awardedById: me.id } }),
    prisma.serviceRecord.create({
      data: {
        userId,
        type: "QUALIFICATION",
        title: `Qualified: ${qual.title}`,
        description: `Certified against version ${qual.version}.`,
        issuedById: me.id,
      },
    }),
  ]);
  revalidatePath(`/roster/${userId}`);
  return { ok: `${qual.title} awarded.` };
}

export async function revokeQualification(data: FormData) {
  const me = await assertPerm("INSTRUCTOR");
  const uq = await prisma.userQualification.delete({
    where: { id: String(data.get("userQualId")) },
    include: { qualification: true },
  });
  await prisma.serviceRecord.create({
    data: { userId: uq.userId, type: "NOTE", title: `Qualification revoked: ${uq.qualification.title}`, issuedById: me.id },
  });
  revalidatePath(`/roster/${uq.userId}`);
}
