"use server";

import type { Attendance } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import type { SaveOutcome } from "@/components/board-editor";
import { assertPerm } from "@/lib/auth";
import { readSlotMap } from "@/lib/board-input";
import { announceEvent, createEvent, deleteEvent, markAttendance, respond, saveSheet, setPreferences, setSignupsOpen, updateEvent } from "@/lib/events";
import { parseEvent } from "@/lib/event-rules";
import { savePlan, saveReview } from "@/lib/training";
import { prisma } from "@/lib/prisma";

// Fixtures' server actions. Staff write the schedule, plan, team sheet and
// attendance; any member answers for themselves (the action only ever writes
// the signed-in person's own sign-up). Each re-checks who is asking.

const str = (d: FormData, k: string) => String(d.get(k) ?? "");
const refresh = (id?: string) => {
  revalidatePath("/fixtures", "layout");
  if (id) revalidatePath(`/fixtures/${id}`);
  revalidatePath("/");
};
const actor = (u: { id: string; name: string }) => ({ id: u.id, name: u.name });

/** Create (no id) or edit a one-off event. */
export async function saveEventAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const parsed = parseEvent((k) => str(data, k));
  if (!parsed.ok) return { error: "Check the highlighted fields.", fieldErrors: parsed.errors };
  const id = str(data, "id");
  if (id) {
    const r = await updateEvent(id, parsed.value);
    if (!r.ok) return { error: r.error };
    refresh(id);
    // Warnings (a cleared team sheet, a Discord post that didn't update) are worth seeing: stay on the form.
    if (r.warnings.length) return { ok: "Saved.", warnings: r.warnings };
    redirect(`/fixtures/${id}`);
  }
  const r = await createEvent(parsed.value, actor(user), { announce: !!data.get("announce") });
  if (!r.ok) return { error: r.error };
  refresh(r.event.id);
  if (r.warnings.length) return { ok: "Event created.", warnings: [...r.warnings, `Open it: /fixtures/${r.event.id}`] };
  redirect(`/fixtures/${r.event.id}`);
}

export async function deleteEventAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const r = await deleteEvent(str(data, "id"));
  if (!r.ok) return { error: r.error };
  refresh();
  redirect("/fixtures");
}

/** Post the announcement, or bring the posted one up to date (re-posting it if it was deleted). */
export async function announceAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const id = str(data, "id");
  const r = await announceEvent(id);
  if (!r.ok) return { error: r.error };
  refresh(id);
  return { ok: { posted: "Posted to Discord with sign-up buttons.", updated: "Discord post brought up to date.", reposted: "The Discord post was missing, so it was posted again." }[r.outcome] };
}

export async function signupsOpenAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const id = str(data, "id");
  const open = str(data, "open") === "1";
  const r = await setSignupsOpen(id, open);
  if (!r.ok) return { error: r.error };
  refresh(id);
  return { ok: open ? "Sign-ups reopened." : "Sign-ups closed.", warnings: r.warnings };
}

/** The signed-in member's own answer: going, maybe or out. */
export async function respondAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MEMBER");
  const id = str(data, "id");
  const status = str(data, "status");
  if (status !== "GOING" && status !== "MAYBE" && status !== "OUT") return { error: "Pick going, maybe or can't make it." };
  const r = await respond(id, { id: user.id }, { kind: "status", status }, "SITE");
  if (!r.ok) return { error: r.error };
  refresh(id);
  return { ok: `You're down as ${{ GOING: "going", MAYBE: "maybe", OUT: "out" }[status]}.`, warnings: r.warnings };
}

/** Take a position on the event's formation, or give it up (empty slotKey). Claiming is signing up. */
export async function claimSlotAction(eventId: string, slotKey: string): Promise<{ ok: boolean; message: string }> {
  const user = await assertPerm("MEMBER");
  const r = await respond(eventId, { id: user.id }, slotKey ? { kind: "claim", slotKey } : { kind: "release" }, "SITE");
  if (!r.ok) return { ok: false, message: r.error };
  refresh(eventId);
  return { ok: true, message: slotKey ? "You're in. Position taken." : "Position given up. You're still down as going." };
}

export async function preferencesAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MEMBER");
  const id = str(data, "id");
  const r = await setPreferences(id, user.id, [str(data, "pref1"), str(data, "pref2"), str(data, "pref3")]);
  if (!r.ok) return { error: r.error };
  refresh(id);
  return { ok: "Your positions are saved." };
}

/** Mark what actually happened for each signed-up player; only rows that changed are written. */
export async function attendanceAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const eventId = str(data, "id");
  const rows = await prisma.eventSignup.findMany({ where: { eventId }, select: { id: true, attendance: true } });
  let changed = 0;
  for (const row of rows) {
    const raw = str(data, `att__${row.id}`);
    const next = (raw === "" ? null : raw) as Attendance | null;
    if (next === row.attendance) continue;
    const r = await markAttendance(eventId, row.id, next, actor(user));
    if (!r.ok) return { error: r.error };
    changed++;
  }
  refresh(eventId);
  revalidatePath("/players", "layout");
  return { ok: changed ? `Attendance saved (${changed} changed).` : "Nothing changed." };
}

/** The event's team sheet: draft or publish. Staff only. */
export async function saveSheetAction(eventId: string, input: { formation: string; slots: unknown; intent: string }): Promise<SaveOutcome> {
  const user = await assertPerm("STAFF");
  const slots = readSlotMap(input.slots);
  if (!slots) return { ok: false, errors: ["That request wasn't understood. Reload the page."] };
  const r = await saveSheet(eventId, slots, input.intent === "publish", actor(user));
  if (!r.ok) return r;
  refresh(eventId);
  return { ok: true, message: r.warnings.length ? `${r.message} ${r.warnings.join(" ")}` : r.message };
}

/** A training session's plan: objective, plan and a brief per position. */
export async function savePlanAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const id = str(data, "id");
  const briefs: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (k.startsWith("brief__")) briefs[k.slice(7)] = String(v);
  const r = await savePlan(id, { objective: str(data, "objective"), plan: str(data, "plan"), briefs });
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  refresh(id);
  revalidatePath("/training");
  return { ok: "Plan saved.", warnings: r.warnings };
}

export async function saveReviewAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const id = str(data, "id");
  const r = await saveReview(id, str(data, "review"), actor(user));
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  refresh(id);
  revalidatePath("/training");
  return { ok: "Review saved." };
}
