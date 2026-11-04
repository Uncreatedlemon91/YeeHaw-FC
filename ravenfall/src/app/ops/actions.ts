"use server";

import type { AttendanceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { evaluateAwards } from "@/lib/award-evaluator";
import { announceAutoNominationsLater } from "@/lib/award-notify";
import { recommendPromotions } from "@/lib/promotions";
import { assertPerm } from "@/lib/auth";
import { explain } from "@/lib/discord";
import { SQUADS } from "@/config/unit";
import { isInvited } from "@/lib/event-invites";
import { announceEvent, cancelEventPost, pushEventPost, refreshEventPostLater } from "@/lib/ops-notify";
import { RSVP_CHOICES } from "@/lib/rsvp";
import { prisma } from "@/lib/prisma";
import { fromInput } from "@/lib/time";

const eventSchema = z.object({
  title: z.string().trim().min(3, "Give it a title.").max(120),
  type: z.enum(["OP", "TRAINING", "BRIEFING"]),
  description: z.string().max(20000).default(""),
  location: z.string().trim().max(120).optional(),
  startTime: z.date({ invalid_type_error: "Set a start time." }),
  endTime: z.date().nullable(),
  mandatory: z.boolean(),
  // Empty: the whole unit.
  invitedSquads: z.array(z.enum(SQUADS.map((s) => s.name) as [string, ...string[]])).max(SQUADS.length),
});

function parseEvent(data: FormData) {
  const parsed = eventSchema.safeParse({
    title: data.get("title"),
    type: data.get("type"),
    description: String(data.get("description") ?? ""),
    location: String(data.get("location") ?? "") || undefined,
    startTime: fromInput(String(data.get("startTime") ?? "")),
    endTime: fromInput(String(data.get("endTime") ?? "")),
    mandatory: data.get("mandatory") === "on",
    invitedSquads: [...new Set(data.getAll("invitedSquads").map(String))],
  });
  if (parsed.success && parsed.data.endTime && parsed.data.endTime <= parsed.data.startTime) {
    return { error: "The end time must be after the start." } as const;
  }
  return parsed.success ? ({ data: parsed.data } as const) : ({ error: parsed.error.issues[0]?.message ?? "Check the form." } as const);
}

export async function createEvent(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("INSTRUCTOR");
  const r = parseEvent(data);
  if ("error" in r) return { error: r.error };
  const event = await prisma.event.create({ data: { ...r.data, createdById: me.id } });
  if (data.get("announce") === "on") await announceEvent(event.id).catch((e) => console.error(`[ops] announce: ${explain(e)}`));
  revalidatePath("/ops");
  redirect(`/ops/${event.id}`);
}

export async function updateEvent(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("INSTRUCTOR");
  const id = String(data.get("id"));
  const r = parseEvent(data);
  if ("error" in r) return { error: r.error };
  await prisma.event.update({ where: { id }, data: r.data });
  refreshEventPostLater(id);
  revalidatePath("/ops");
  revalidatePath(`/ops/${id}`);
  redirect(`/ops/${id}`);
}

/** The event page's "Update Discord post" / "Repost to Discord" buttons. */
export async function discordPost(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("INSTRUCTOR");
  const id = String(data.get("id"));
  const mode = data.get("mode") === "repost" ? "repost" : "update";
  try {
    const done = await pushEventPost(id, mode);
    revalidatePath(`/ops/${id}`);
    return { ok: done === "updated" ? "Discord post updated." : done === "reposted" ? "Reposted to Discord; the old post was removed." : "Posted to Discord." };
  } catch (e) {
    return { error: `Discord said no: ${explain(e)}` };
  }
}

export async function deleteEvent(data: FormData) {
  await assertPerm("ADMIN");
  const gone = await prisma.event.delete({ where: { id: String(data.get("id")) } });
  await cancelEventPost(gone).catch((e) => console.error(`[ops] cancel post: ${explain(e)}`));
  revalidatePath("/ops");
  redirect("/ops");
}

export async function rsvp(data: FormData) {
  const me = await assertPerm("OPERATOR");
  const eventId = String(data.get("eventId"));
  const choice = String(data.get("status"));
  const [event, member] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    prisma.user.findUnique({ where: { id: me.id }, select: { id: true, squad: true } }),
  ]);
  // RSVPs close once the event starts; after that the AAR owns attendance.
  // Only those invited may answer (CLEAR is always allowed, to take one back).
  if (!event || !member || event.startTime < new Date()) return;
  if (choice !== "CLEAR" && !isInvited(event, member)) return;
  if (choice === "CLEAR") {
    await prisma.attendance.deleteMany({ where: { eventId, userId: me.id } });
  } else if ((RSVP_CHOICES as readonly string[]).includes(choice)) {
    await prisma.attendance.upsert({
      where: { eventId_userId: { eventId, userId: me.id } },
      create: { eventId, userId: me.id, status: choice as AttendanceStatus },
      update: { status: choice as AttendanceStatus },
    });
  }
  refreshEventPostLater(eventId);
  revalidatePath(`/ops/${eventId}`);
  revalidatePath("/dashboard");
}

const MARKS = ["ATTENDING", "ABSENT", "EXCUSED", "NOSHOW"] as const;

/** File (or revise) the after-action report and the final attendance. */
export async function saveDebrief(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("INSTRUCTOR");
  const eventId = String(data.get("eventId"));
  const debrief = String(data.get("debrief") ?? "").trim();
  if (debrief.length > 50000) return { error: "That debrief is too long." };

  // Each member row posts "att:<userId>" = status, or "" to leave them off.
  const marks: { userId: string; status: AttendanceStatus }[] = [];
  const cleared: string[] = [];
  for (const [k, v] of data.entries()) {
    if (!k.startsWith("att:")) continue;
    const userId = k.slice(4);
    if (MARKS.includes(v as (typeof MARKS)[number])) marks.push({ userId, status: v as AttendanceStatus });
    else cleared.push(userId);
  }

  await prisma.$transaction([
    prisma.event.update({
      where: { id: eventId },
      data: { debrief: debrief || null, debriefById: me.id, debriefAt: new Date() },
    }),
    prisma.attendance.deleteMany({ where: { eventId, userId: { in: cleared } } }),
    ...marks.map((m) =>
      prisma.attendance.upsert({
        where: { eventId_userId: { eventId, userId: m.userId } },
        create: { eventId, ...m },
        update: { status: m.status },
      }),
    ),
  ]);
  // Automatic award nominations and promotion recommendations for the people
  // who were there, for S1 to approve. Never fails the report.
  try {
    const attended = marks.filter((m) => m.status === "ATTENDING").map((m) => m.userId);
    const { created } = await evaluateAwards({ userIds: attended, eventId });
    announceAutoNominationsLater(created);
    await recommendPromotions({ userIds: attended });
  } catch (e) {
    console.error("[awards] evaluation after AAR failed:", e);
  }
  refreshEventPostLater(eventId);
  revalidatePath(`/ops/${eventId}`);
  redirect(`/ops/${eventId}`);
}
