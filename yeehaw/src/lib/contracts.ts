import { Prisma, type Contract, type RosterMoveKind } from "@prisma/client";
import {
  answeredOffer,
  changeDm,
  departurePost,
  offerMessage,
  signingPost,
  withdrawnOffer,
  type OfferView,
} from "./contract-messages";
import {
  checkResponse,
  describeChange,
  findConflicts,
  type Decision,
  type LiveHolder,
  type TermErrors,
  type Terms,
} from "./contract-rules";
import { getChannelConfig } from "./channel-config";
import { dm, dmMessage, editMessage, explain, sendMessage } from "./discord";
import { prisma } from "./prisma";
import { prospectAnswered, prospectOffered } from "./recruitment-stages";
import { syncQuietly } from "./role-sync";

// Contract lifecycle: offer, accept / decline, mid-season changes, release,
// withdraw. Each function validates, writes, then does the Discord side
// (messages, roles) AFTER the write: a Discord problem is reported back as a
// warning and never undoes the change on the site.

export type Actor = { id: string; name: string } | null;
export type Result<T = object> = ({ ok: true; warnings: string[] } & T) | { ok: false; error: string; fieldErrors?: Record<string, TermErrors | string> };

const fail = (error: string, fieldErrors?: Record<string, TermErrors | string>) => ({ ok: false as const, error, fieldErrors });
const msg = (e: unknown) => explain(e);

const WITH_TERMS = {
  player: true,
  season: true,
  objectives: { orderBy: { position: "asc" as const } },
  offeredBy: true,
} satisfies Prisma.ContractInclude;

/** Live (OFFERED / ACTIVE) holders of numbers and armbands in a season. */
export async function liveHolders(seasonId: string, excludeContractIds: string[] = []): Promise<LiveHolder[]> {
  const rows = await prisma.contract.findMany({
    where: { seasonId, state: { in: ["OFFERED", "ACTIVE"] }, id: { notIn: excludeContractIds } },
    select: { playerId: true, shirtNumber: true, captaincy: true, player: { select: { displayName: true } } },
  });
  return rows.map((r) => ({ playerId: r.playerId, name: r.player.displayName, shirtNumber: r.shirtNumber, captaincy: r.captaincy }));
}

async function recordMove(m: {
  kind: RosterMoveKind;
  contract: Pick<Contract, "id" | "seasonId" | "playerId" | "position" | "secondaryPosition" | "squadStatus">;
  displayName: string;
  note?: string | null;
  actor?: Actor;
  channelId?: string | null;
  messageId?: string | null;
}) {
  return prisma.rosterMove.create({
    data: {
      kind: m.kind,
      playerId: m.contract.playerId,
      displayName: m.displayName,
      seasonId: m.contract.seasonId,
      contractId: m.contract.id,
      position: m.contract.position,
      secondaryPosition: m.contract.secondaryPosition,
      squadStatus: m.contract.squadStatus,
      note: m.note ?? null,
      actorId: m.actor?.id ?? null,
      actorName: m.actor?.name ?? null,
      discordChannelId: m.channelId ?? null,
      discordMessageId: m.messageId ?? null,
    },
  });
}

/** Post to the roster channel; returns where it landed, or why not. */
async function postRoster(payload: object): Promise<{ channelId: string; messageId: string } | { error: string } | null> {
  const { roster } = await getChannelConfig();
  if (!roster) return null;
  try {
    const m = await sendMessage(roster, payload);
    return { channelId: m.channel_id, messageId: m.id };
  } catch (e) {
    return { error: msg(e) };
  }
}

export function offerView(c: Awaited<ReturnType<typeof loadContract>> & object): OfferView {
  return {
    contractId: c.id,
    seasonName: c.season.name,
    seasonStartsAt: c.season.startsAt,
    playerDiscordId: c.player.discordId,
    offeredBy: c.offeredBy?.displayName ?? null,
    terms: {
      shirtNumber: c.shirtNumber,
      squadStatus: c.squadStatus,
      position: c.position,
      secondaryPosition: c.secondaryPosition,
      captaincy: c.captaincy,
      objectives: c.objectives.map((o) => ({ kind: o.kind, target: o.target })),
    },
  };
}

export const loadContract = (id: string) => prisma.contract.findUnique({ where: { id }, include: WITH_TERMS });

const objectivesData = (terms: Terms) => terms.objectives.map((o, position) => ({ kind: o.kind, target: o.target, position }));

// --- Offers -------------------------------------------------------------- //

export type OfferRow = { playerId: string; terms: Terms; previousContractId?: string | null };
export type OfferOutcome = { playerId: string; name: string; contractId: string; delivered: "dm" | "channel" | "none"; warning?: string };

/**
 * Offer contracts for a season, all or nothing: if any row breaks a rule
 * (number or armband taken, player already has a live contract) nothing is
 * written. Then each offer is delivered to the player in Discord. Also the
 * entry point for recruitment's "offer a contract".
 */
export async function offerContracts(seasonId: string, rows: OfferRow[], actor: Actor): Promise<Result<{ outcomes: OfferOutcome[] }>> {
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) return fail("That season no longer exists.");
  if (season.state !== "WINDOW" && season.state !== "ACTIVE")
    return fail(`Offers can go out while a season's window is open or the season is running. ${season.name} is ${season.state === "DRAFT" ? "still a draft" : "over"}.`);
  if (!rows.length) return fail("Tick at least one player to offer.");

  const players = await prisma.player.findMany({ where: { id: { in: rows.map((r) => r.playerId) } } });
  const byId = new Map(players.map((p) => [p.id, p]));
  const existing = await prisma.contract.findMany({ where: { seasonId, playerId: { in: rows.map((r) => r.playerId) } } });
  const existingBy = new Map(existing.map((c) => [c.playerId, c]));

  const fieldErrors: Record<string, TermErrors | string> = {};
  for (const r of rows) {
    const p = byId.get(r.playerId);
    if (!p) fieldErrors[r.playerId] = "That player no longer exists.";
    else if (["OFFERED", "ACTIVE"].includes(existingBy.get(r.playerId)?.state ?? ""))
      fieldErrors[r.playerId] = `${p.displayName} already has ${existingBy.get(r.playerId)!.state === "ACTIVE" ? "a contract" : "an open offer"} for ${season.name}.`;
  }
  const checkable = rows.filter((r) => !fieldErrors[r.playerId]);
  const conflicts = findConflicts(
    await liveHolders(seasonId),
    checkable.map((r) => ({ key: r.playerId, playerId: r.playerId, name: byId.get(r.playerId)!.displayName, shirtNumber: r.terms.shirtNumber, captaincy: r.terms.captaincy })),
  );
  Object.assign(fieldErrors, conflicts);
  if (Object.keys(fieldErrors).length) return fail("Nothing was sent: fix the highlighted rows first.", fieldErrors);

  const ids: string[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const base = {
          shirtNumber: r.terms.shirtNumber,
          squadStatus: r.terms.squadStatus,
          position: r.terms.position,
          secondaryPosition: r.terms.secondaryPosition,
          captaincy: r.terms.captaincy,
          state: "OFFERED" as const,
          previousContractId: r.previousContractId ?? null,
          offeredById: actor?.id ?? null,
          offeredAt: new Date(),
          respondedAt: null,
          rolesGranted: false,
          roleError: null,
          releasedAt: null,
          releasedById: null,
          releaseNote: null,
          endedAt: null,
          offerChannelId: null,
          offerMessageId: null,
        };
        const old = existingBy.get(r.playerId);
        const c = old
          ? await tx.contract.update({ where: { id: old.id }, data: { ...base, objectives: { deleteMany: {}, create: objectivesData(r.terms) } } })
          : await tx.contract.create({ data: { ...base, seasonId, playerId: r.playerId, objectives: { create: objectivesData(r.terms) } } });
        ids.push(c.id);
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return fail("Somebody just took one of those numbers or armbands. Reload and try again.");
    throw e;
  }

  const outcomes: OfferOutcome[] = [];
  for (const [i, id] of ids.entries()) outcomes.push(await deliverOffer(id, actor, !!rows[i].previousContractId));
  // A recruitment file for the player follows the offer (Prospect / On trial -> Offered).
  await prospectOffered(rows.map((r) => r.playerId)).catch((e) => console.error("recruitment file not updated", e));
  await syncQuietly(...rows.map((r) => r.playerId));
  const warnings = outcomes.flatMap((o) => (o.warning ? [`${o.name}: ${o.warning}`] : []));
  return { ok: true, warnings, outcomes };
}

/**
 * Send (or re-send) the offer message: a DM first, since terms are private;
 * the roster channel with a mention if the player's DMs are closed.
 */
export async function deliverOffer(contractId: string, actor: Actor = null, renewal = false): Promise<OfferOutcome> {
  const c = (await loadContract(contractId))!;
  const view = offerView(c);
  let channelId: string | null = null;
  let messageId: string | null = null;
  let delivered: OfferOutcome["delivered"] = "none";
  let warning: string | undefined;
  try {
    const m = await dmMessage(c.player.discordId, offerMessage(view));
    [channelId, messageId, delivered] = [m.channel_id, m.id, "dm"];
  } catch (e) {
    warning = `couldn't DM the offer (${msg(e)})`;
    const posted = await postRoster(offerMessage(view, { mention: true }));
    if (posted && "channelId" in posted) {
      [channelId, messageId, delivered, warning] = [posted.channelId, posted.messageId, "channel", "DMs are closed, so the offer was posted in the roster channel."];
    } else if (posted) warning += `; the roster channel failed too: ${posted.error}`;
    else warning += " and no roster channel is set, so they must answer on their hub.";
  }
  await prisma.contract.update({ where: { id: c.id }, data: { offerChannelId: channelId, offerMessageId: messageId } });
  await recordMove({ kind: renewal ? "RENEWAL" : "OFFER", contract: c, displayName: c.player.displayName, actor, channelId, messageId });
  return { playerId: c.playerId, name: c.player.displayName, contractId: c.id, delivered, warning };
}

// --- Accept / decline ---------------------------------------------------- //

/**
 * The named player answers an offer. Accepting makes the contract ACTIVE
 * straight away, with no staff confirmation. The write is atomic on the
 * state, so a double click can't answer twice.
 */
export async function respondToContract(contractId: string, actorDiscordId: string | undefined, decision: Decision): Promise<{ ok: true; contract: NonNullable<Awaited<ReturnType<typeof loadContract>>> } | { ok: false; error: string }> {
  const c = await loadContract(contractId);
  if (!c) return { ok: false, error: "That offer no longer exists." };
  const check = checkResponse({ state: c.state, playerDiscordId: c.player.discordId, seasonState: c.season.state }, actorDiscordId);
  if (!check.ok) return check;
  const state = decision === "accept" ? "ACTIVE" : "DECLINED";
  const done = await prisma.contract.updateMany({ where: { id: c.id, state: "OFFERED" }, data: { state, respondedAt: new Date() } });
  if (done.count === 0) return { ok: false, error: "This offer has already been answered." };
  await recordMove({ kind: decision === "accept" ? "ACCEPT" : "DECLINE", contract: c, displayName: c.player.displayName, actor: { id: c.playerId, name: c.player.displayName } });
  // Accepting signs the recruitment file (accepting needs no staff confirmation here).
  await prospectAnswered(c.playerId, decision).catch((e) => console.error("recruitment file not updated", e));
  return { ok: true, contract: { ...c, state } };
}

/**
 * What follows an answer: grant or remove roles, post the signing, tell
 * management about a decline, and (from the hub) close the offer message in
 * Discord. Returns warnings; never throws.
 */
export async function afterResponse(contractId: string, decision: Decision, opts: { editOffer: boolean }): Promise<string[]> {
  const warnings: string[] = [];
  const c = await loadContract(contractId);
  if (!c) return warnings;
  const view = offerView(c);
  try {
    if (opts.editOffer && c.offerChannelId && c.offerMessageId)
      await editMessage(c.offerChannelId, c.offerMessageId, answeredOffer(view, decision));
  } catch (e) {
    warnings.push(`The offer message in Discord wasn't updated: ${msg(e)}`);
  }

  const problems = await syncQuietly(c.playerId);
  if (decision === "accept") {
    await prisma.contract.update({ where: { id: c.id }, data: { rolesGranted: problems.length === 0, roleError: problems[0] ?? null } });
    const posted = await postRoster(signingPost(c.player.displayName, c.season.name, view.terms));
    if (posted && "channelId" in posted)
      await prisma.rosterMove.updateMany({ where: { contractId: c.id, kind: "ACCEPT" }, data: { discordChannelId: posted.channelId, discordMessageId: posted.messageId } });
    else if (posted) warnings.push(`The signing wasn't announced: ${posted.error}`);
  } else {
    const { management, roster } = await getChannelConfig();
    const to = management || roster;
    if (to) {
      try {
        await sendMessage(to, { content: `${c.player.displayName} declined the contract offer for ${c.season.name}.`, allowed_mentions: { parse: [] } });
      } catch (e) {
        warnings.push(`Management wasn't told about the decline: ${msg(e)}`);
      }
    }
  }
  warnings.push(...problems);
  return warnings;
}

// --- Mid-season changes, release, withdraw ------------------------------- //

/** Management change a live contract directly; the player is DMed, no re-offer. */
export async function changeContract(contractId: string, terms: Terms, actor: Actor): Promise<Result<{ changes: string[] }>> {
  const c = await loadContract(contractId);
  if (!c) return fail("That contract no longer exists.");
  if (c.state !== "ACTIVE") return fail("Only a contract that is in force can be changed. Withdraw an open offer and offer again instead.");
  const before: Terms = {
    shirtNumber: c.shirtNumber,
    squadStatus: c.squadStatus,
    position: c.position,
    secondaryPosition: c.secondaryPosition,
    captaincy: c.captaincy,
    objectives: c.objectives.map((o) => ({ kind: o.kind, target: o.target })),
  };
  const changes = describeChange(before, terms);
  if (!changes.length) return { ok: true, warnings: [], changes };

  const conflicts = findConflicts(await liveHolders(c.seasonId, [c.id]), [
    { key: c.id, playerId: c.playerId, name: c.player.displayName, shirtNumber: terms.shirtNumber, captaincy: terms.captaincy },
  ]);
  if (conflicts[c.id]) return fail("Not saved: " + Object.values(conflicts[c.id]).join(" "), { [c.id]: conflicts[c.id] });

  try {
    await prisma.$transaction([
      prisma.contract.update({
        where: { id: c.id },
        data: {
          shirtNumber: terms.shirtNumber,
          squadStatus: terms.squadStatus,
          position: terms.position,
          secondaryPosition: terms.secondaryPosition,
          captaincy: terms.captaincy,
          objectives: { deleteMany: {}, create: objectivesData(terms) },
        },
      }),
      prisma.rosterMove.create({
        data: {
          kind: "CHANGE",
          playerId: c.playerId,
          displayName: c.player.displayName,
          seasonId: c.seasonId,
          contractId: c.id,
          position: terms.position,
          secondaryPosition: terms.secondaryPosition,
          squadStatus: terms.squadStatus,
          note: changes.join("; "),
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
        },
      }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return fail("Somebody just took that number or armband. Reload and try again.");
    throw e;
  }

  const warnings: string[] = [];
  try {
    await dm(c.player.discordId, changeDm(c.season.name, changes));
  } catch (e) {
    warnings.push(`Saved, but ${c.player.displayName} wasn't DMed: ${msg(e)}`);
  }
  if (before.squadStatus !== terms.squadStatus) warnings.push(...(await syncQuietly(c.playerId)));
  return { ok: true, warnings, changes };
}

/** End a live contract mid-season: roles come off and a departure is posted. */
export async function releaseContract(contractId: string, note: string, actor: Actor): Promise<Result> {
  const c = await loadContract(contractId);
  if (!c) return fail("That contract no longer exists.");
  if (c.state !== "ACTIVE") return fail("Only a contract in force can be released.");
  const now = new Date();
  const done = await prisma.contract.updateMany({
    where: { id: c.id, state: "ACTIVE" },
    data: { state: "RELEASED", releasedAt: now, endedAt: now, releasedById: actor?.id ?? null, releaseNote: note.trim() || null },
  });
  if (!done.count) return fail("That contract was already ended.");
  const move = await recordMove({ kind: "RELEASE", contract: c, displayName: c.player.displayName, note: note.trim() || null, actor });

  const warnings = await syncQuietly(c.playerId);
  const posted = await postRoster(departurePost(c.player.displayName, c.season.name, note.trim() || null));
  if (posted && "channelId" in posted)
    await prisma.rosterMove.update({ where: { id: move.id }, data: { discordChannelId: posted.channelId, discordMessageId: posted.messageId } });
  else if (posted) warnings.push(`The departure wasn't posted: ${posted.error}`);
  return { ok: true, warnings };
}

/** Take back an offer nobody has answered. */
export async function withdrawOffer(contractId: string, actor: Actor): Promise<Result> {
  const c = await loadContract(contractId);
  if (!c) return fail("That offer no longer exists.");
  if (c.state !== "OFFERED") return fail("Only an open offer can be withdrawn.");
  const done = await prisma.contract.updateMany({
    where: { id: c.id, state: "OFFERED" },
    data: { state: "DECLINED", respondedAt: new Date(), releaseNote: `Withdrawn by ${actor?.name ?? "management"}` },
  });
  if (!done.count) return fail("That offer was just answered.");
  await recordMove({ kind: "DECLINE", contract: c, displayName: c.player.displayName, note: "Offer withdrawn", actor });
  const warnings: string[] = [];
  try {
    if (c.offerChannelId && c.offerMessageId) await editMessage(c.offerChannelId, c.offerMessageId, withdrawnOffer(offerView(c)));
  } catch (e) {
    warnings.push(`The offer message in Discord wasn't closed: ${msg(e)}`);
  }
  warnings.push(...(await syncQuietly(c.playerId)));
  return { ok: true, warnings };
}

