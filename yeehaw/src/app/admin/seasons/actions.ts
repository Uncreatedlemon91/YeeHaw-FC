"use server";

import type { SeasonState } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { offerContracts, withdrawOffer, deliverOffer, type OfferRow } from "@/lib/contracts";
import type { TermErrors } from "@/lib/contract-rules";
import { prefixErrors, readTerms } from "@/lib/form-terms";
import { prisma } from "@/lib/prisma";
import { createSeason, deleteSeason, transitionSeason, updateSeason } from "@/lib/seasons";
import { fromInput } from "@/lib/time";

// Management only, re-checked on every action.

const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const refresh = () => {
  revalidatePath("/admin/seasons", "layout");
  revalidatePath("/players", "layout");
};

function datesOf(data: FormData) {
  const startsAt = fromInput(str(data, "startsAt"));
  const endsAt = fromInput(str(data, "endsAt"));
  const windowOpensAt = fromInput(str(data, "windowOpensAt"));
  const missing: Record<string, string> = {};
  if (!startsAt) missing.startsAt = "Enter the start.";
  if (!endsAt) missing.endsAt = "Enter the end.";
  if (!windowOpensAt) missing.windowOpensAt = "Enter when the window opens.";
  return Object.keys(missing).length ? { missing } : { dates: { startsAt: startsAt!, endsAt: endsAt!, windowOpensAt: windowOpensAt! } };
}

export async function createSeasonAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("MANAGEMENT");
  const d = datesOf(data);
  if (d.missing) return { error: "Check the dates.", fieldErrors: d.missing };
  const r = await createSeason(str(data, "name"), d.dates);
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  refresh();
  redirect(`/admin/seasons?season=${r.season.id}`);
}

export async function updateSeasonAction(id: string, _: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("MANAGEMENT");
  const d = datesOf(data);
  if (d.missing) return { error: "Check the dates.", fieldErrors: d.missing };
  const r = await updateSeason(id, str(data, "name"), d.dates);
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  refresh();
  return { ok: "Saved." };
}

export async function transitionSeasonAction(id: string, to: SeasonState, _: ActionState, __: FormData): Promise<ActionState> {
  await assertPerm("MANAGEMENT");
  const r = await transitionSeason(id, to);
  if (!r.ok) return { error: r.error };
  refresh();
  const done: Record<SeasonState, string> = {
    DRAFT: "Back to a draft.",
    WINDOW: "The re-signing window is open.",
    ACTIVE: "The season has started.",
    ENDED: "The season has ended.",
  };
  return { ok: done[to], warnings: r.warnings };
}

export async function deleteSeasonAction(id: string, _: ActionState, __: FormData): Promise<ActionState> {
  await assertPerm("MANAGEMENT");
  const r = await deleteSeason(id);
  if (!r.ok) return { error: r.error };
  refresh();
  redirect("/admin/seasons");
}

/**
 * The re-signing window's Send offers. Fields are namespaced by player id:
 * `row` (repeatable) lists the players on screen, `offer:<id>` is the tick,
 * `<id>:shirtNumber` etc. are the terms, `<id>:prev` the contract re-signed.
 */
export async function sendOffers(seasonId: string, _: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MANAGEMENT");
  const ids = [...new Set(data.getAll("row").map(String))].filter((id) => data.get(`offer:${id}`));
  if (!ids.length) return { error: "Tick at least one player to offer." };

  const rows: OfferRow[] = [];
  let fieldErrors: Record<string, string> = {};
  for (const id of ids) {
    const t = readTerms(data, `${id}:`);
    if (t.fieldErrors) fieldErrors = { ...fieldErrors, ...t.fieldErrors };
    else rows.push({ playerId: id, terms: t.terms, previousContractId: str(data, `${id}:prev`) || null });
  }
  if (Object.keys(fieldErrors).length) return { error: "Nothing was sent: check the highlighted fields.", fieldErrors };

  const r = await offerContracts(seasonId, rows, { id: user.id, name: user.name });
  if (!r.ok) {
    const flat: Record<string, string> = {};
    const general: string[] = [];
    for (const [id, e] of Object.entries(r.fieldErrors ?? {})) {
      if (typeof e === "string") general.push(e);
      else Object.assign(flat, prefixErrors(`${id}:`, e as TermErrors));
    }
    return { error: [r.error, ...general].join(" "), fieldErrors: flat };
  }
  refresh();
  const dm = r.outcomes.filter((o) => o.delivered === "dm").length;
  return {
    ok: `Sent ${r.outcomes.length} offer${r.outcomes.length === 1 ? "" : "s"} (${dm} by DM). Players can accept in Discord or on their hub.`,
    warnings: r.warnings,
  };
}

export async function withdrawFromWindow(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MANAGEMENT");
  const r = await withdrawOffer(str(data, "contractId"), { id: user.id, name: user.name });
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: "Offer withdrawn.", warnings: r.warnings };
}

export async function resendOffer(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MANAGEMENT");
  const c = await prisma.contract.findUnique({ where: { id: str(data, "contractId") }, select: { id: true, state: true } });
  if (!c || c.state !== "OFFERED") return { error: "That offer is no longer open." };
  const o = await deliverOffer(c.id, { id: user.id, name: user.name });
  refresh();
  return o.delivered === "none" ? { error: `Not delivered: ${o.warning}` } : { ok: "Offer sent again.", warnings: o.warning ? [o.warning] : [] };
}
