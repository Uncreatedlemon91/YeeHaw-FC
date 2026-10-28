"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { createSeries, deleteSeries, setSeriesActive, updateSeries } from "@/lib/event-series";
import { parseSeries } from "@/lib/event-rules";

// Recurring series: staff only, re-checked on every action.

const str = (d: FormData, k: string) => String(d.get(k) ?? "");
const refresh = () => {
  revalidatePath("/fixtures", "layout");
  revalidatePath("/");
};
const read = (data: FormData) => parseSeries((k) => str(data, k), (k) => data.getAll(k).map(String));

export async function createSeriesAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const parsed = read(data);
  if (!parsed.ok) return { error: "Check the highlighted fields.", fieldErrors: parsed.errors };
  const r = await createSeries(parsed.value, { id: user.id, name: user.name });
  if (!r.ok) return { error: r.error };
  refresh();
  redirect(`/fixtures/series?made=${r.created}`);
}

export async function updateSeriesAction(id: string, _: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const parsed = read(data);
  if (!parsed.ok) return { error: "Check the highlighted fields.", fieldErrors: parsed.errors };
  const r = await updateSeries(id, parsed.value);
  if (!r.ok) return { error: r.error };
  refresh();
  const c = r.changed;
  return {
    ok: `Saved. Upcoming events: ${c.updated} updated, ${c.created} added, ${c.removed} removed${c.detached ? `, ${c.detached} kept as one-offs` : ""}.`,
    warnings: r.warnings,
  };
}

export async function seriesActiveAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const r = await setSeriesActive(str(data, "id"), str(data, "active") === "1");
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: str(data, "active") === "1" ? "Resumed." : "Paused: nothing new will be generated." };
}

export async function deleteSeriesAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const r = await deleteSeries(str(data, "id"));
  if (!r.ok) return { error: r.error };
  refresh();
  redirect("/fixtures/series");
}
