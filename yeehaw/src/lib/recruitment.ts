import type { Position, Prospect, ProspectStage } from "@prisma/client";
import { POSITION_LABEL } from "@/config/club";
import { getChannelConfig } from "./channel-config";
import { offerContracts, type Actor as OfferActor } from "./contracts";
import type { Actor } from "./events";
import type { Terms } from "./contract-rules";
import { dm, explain, getMember, listMembers, sendMessage } from "./discord";
import { displayNameOf } from "./member-sync";
import { ensurePlayer } from "./players";
import { prisma } from "./prisma";
import {
  ACTIVE_STAGES,
  averageRating,
  feedbackEmbed,
  manualMove,
  newArrivals,
  onboardingProgress,
  onboardingSteps,
  parseProspect,
  parseTrialNote,
  STAGES,
  tickStep,
  welcomeDm,
  type ProspectInput,
} from "./recruitment-rules";
import { syncQuietly } from "./role-sync";

// The recruitment pipeline against the database (port of
// proclubs/recruitment.py): files, trial notes (copied to the recruitment
// channel), new arrivals from the server, the contract offer, and settling in.
// Staff only; every caller checks. Prospect -> Offered and Offered -> Signed
// follow the contract itself (recruitment-stages.ts).

type Res<T = object> = ({ ok: true; warnings: string[] } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
const fail = (error: string, fieldErrors?: Record<string, string>) => ({ ok: false as const, error, fieldErrors });

/** The Discord ids the server's recent joiners list should skip. */
async function knownIds(): Promise<Set<string>> {
  const [prospects, moves, staff, dismissed, contracted] = await Promise.all([
    prisma.prospect.findMany({ where: { discordId: { not: null } }, select: { discordId: true } }),
    prisma.rosterMove.findMany({ select: { player: { select: { discordId: true } } }, distinct: ["playerId"] }),
    prisma.player.findMany({ where: { clubRole: { not: null } }, select: { discordId: true } }),
    prisma.setting.findUnique({ where: { key: "recruitment-dismissed" } }),
    prisma.contract.findMany({ where: { state: { in: ["OFFERED", "ACTIVE"] } }, select: { player: { select: { discordId: true } } } }),
  ]);
  const ids = new Set<string>();
  for (const p of prospects) ids.add(p.discordId!);
  for (const m of moves) ids.add(m.player.discordId);
  for (const s of staff) ids.add(s.discordId);
  for (const c of contracted) ids.add(c.player.discordId);
  const d = dismissed?.value;
  if (Array.isArray(d)) for (const id of d) ids.add(String(id));
  return ids;
}

/** Members who joined in the last 30 days and nobody has dealt with. Empty with a note when Discord can't be read. */
export async function loadArrivals(now = new Date()) {
  try {
    return { arrivals: newArrivals(await listMembers(), await knownIds(), now, displayNameOf), note: null as string | null };
  } catch (e) {
    return { arrivals: [], note: `Couldn't read the server's member list: ${explain(e)}` };
  }
}

export async function dismissArrival(discordId: string): Promise<Res> {
  if (!/^\d{5,25}$/.test(discordId)) return fail("Pick somebody to dismiss.");
  const row = await prisma.setting.findUnique({ where: { key: "recruitment-dismissed" } });
  const ids = (Array.isArray(row?.value) ? (row!.value as unknown[]).map(String) : []).filter((i) => i !== discordId);
  const value = [...ids, discordId].slice(-500);
  await prisma.setting.upsert({ where: { key: "recruitment-dismissed" }, create: { key: "recruitment-dismissed", value }, update: { value } });
  return { ok: true, warnings: [] };
}

// --- Files ------------------------------------------------------------------- //

/** Link a file to the player it names (by Discord id) once they have a record here. */
async function linkPlayer(p: Prospect): Promise<Prospect> {
  if (p.playerId || !p.discordId) return p;
  const player = await prisma.player.findUnique({ where: { discordId: p.discordId } });
  return player ? prisma.prospect.update({ where: { id: p.id }, data: { playerId: player.id } }) : p;
}

async function duplicate(discordId: string | null, keepId?: string): Promise<string | null> {
  if (!discordId) return null;
  const other = await prisma.prospect.findFirst({ where: { discordId, ...(keepId ? { id: { not: keepId } } : {}) }, orderBy: { createdAt: "desc" } });
  return other ? `${other.name} already has a file for that Discord account.` : null;
}

export async function addProspect(input: ProspectInput, actor: Actor, source?: string): Promise<Res<{ prospect: Prospect }>> {
  const dup = await duplicate(input.discordId);
  if (dup) return fail(dup, { discordId: dup });
  const created = await prisma.prospect.create({ data: { ...input, source: input.source ?? source ?? null, addedBy: actor.name } });
  return { ok: true, warnings: [], prospect: await linkPlayer(created) };
}

export async function updateProspect(id: string, input: ProspectInput): Promise<Res> {
  const p = await prisma.prospect.findUnique({ where: { id } });
  if (!p) return fail("That file no longer exists.");
  const dup = await duplicate(input.discordId, id);
  if (dup) return fail(dup, { discordId: dup });
  // A different Discord account is a different person: relink from scratch.
  const updated = await prisma.prospect.update({ where: { id }, data: { ...input, ...(input.discordId !== p.discordId ? { playerId: null } : {}) } });
  await linkPlayer(updated);
  return { ok: true, warnings: [] };
}

export async function deleteProspect(id: string): Promise<Res> {
  const p = await prisma.prospect.findUnique({ where: { id } });
  if (!p) return fail("That file no longer exists.");
  await prisma.prospect.delete({ where: { id } });
  // The trialist role went with the file.
  return { ok: true, warnings: p.playerId ? await syncQuietly(p.playerId) : [] };
}

export async function setStage(id: string, to: ProspectStage): Promise<Res> {
  const p = await prisma.prospect.findUnique({ where: { id } });
  if (!p) return fail("That file no longer exists.");
  const verdict = manualMove(p.stage, to);
  if (!verdict.ok) return fail(verdict.error);
  await prisma.prospect.update({ where: { id }, data: { stage: to } });
  // The trialist role follows On trial and Offered.
  const linked = await linkPlayer(p);
  return { ok: true, warnings: linked.playerId ? await syncQuietly(linked.playerId) : [] };
}

/** Start a file for somebody picked from the server's recent joiners. */
export async function startFile(discordId: string, name: string, actor: Actor): Promise<Res<{ prospect: Prospect }>> {
  const r = parseProspect((k) => ({ name: name.slice(0, 60), discordId, source: "Joined the Discord server" })[k] ?? "");
  if (!r.ok) return fail(Object.values(r.errors)[0], r.errors);
  return addProspect(r.value, actor);
}

// --- Trial notes ---------------------------------------------------------------- //

export async function addNote(prospectId: string, input: { body: string; rating: string; eventId: string }, actor: Actor): Promise<Res> {
  const p = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!p) return fail("That file no longer exists.");
  const parsed = parseTrialNote(input.body, input.rating);
  if (!parsed.ok) return fail(parsed.error, { [parsed.field]: parsed.error });
  const event = input.eventId ? await prisma.event.findUnique({ where: { id: input.eventId }, select: { id: true, title: true, startsAt: true } }) : null;
  if (input.eventId && !event) return fail("That match no longer exists.", { eventId: "That match no longer exists." });

  const note = await prisma.prospectNote.create({ data: { prospectId, eventId: event?.id ?? null, body: parsed.value.body, rating: parsed.value.rating, authorId: actor.id, authorName: actor.name } });
  const stage = p.stage === "PROSPECT" && event ? "TRIAL" : p.stage;
  const warnings: string[] = [];
  if (stage !== p.stage) {
    await prisma.prospect.update({ where: { id: prospectId }, data: { stage } });
    const linked = await linkPlayer(p);
    if (linked.playerId) warnings.push(...(await syncQuietly(linked.playerId)));
  }

  // The copy for the recruitment channel. The note is saved either way.
  const { recruitment } = await getChannelConfig();
  if (recruitment) {
    const all = await prisma.prospectNote.findMany({ where: { prospectId }, select: { rating: true } });
    try {
      const m = await sendMessage(recruitment, {
        embeds: [
          feedbackEmbed(
            { id: p.id, name: p.name, stage, discordId: p.discordId, gamertag: p.gamertag, positions: positionsText(p) },
            { body: note.body, rating: note.rating, authorName: note.authorName, createdAt: note.createdAt },
            event,
            averageRating(all.map((n) => n.rating)),
            all.length,
          ),
        ],
        allowed_mentions: { parse: [] },
      });
      await prisma.prospectNote.update({ where: { id: note.id }, data: { discordMessageId: m.id } });
    } catch (e) {
      warnings.push(`Saved, but not posted in the recruitment channel: ${explain(e)}`);
    }
  }
  return { ok: true, warnings };
}

export const positionsText = (p: { position: Position | null; secondaryPosition: Position | null }) =>
  [p.position, p.secondaryPosition].filter((x): x is Position => !!x).map((x) => POSITION_LABEL[x]).join(" / ");

// --- The offer ---------------------------------------------------------------- //

/** The player a file is about, opening their record from Discord if they have none yet. */
async function playerFor(p: Prospect) {
  if (p.playerId) return prisma.player.findUnique({ where: { id: p.playerId } });
  if (!p.discordId) return null;
  const existing = await prisma.player.findUnique({ where: { discordId: p.discordId } });
  if (existing) return existing;
  const member = await getMember(p.discordId);
  if (!member?.user) return null;
  return ensurePlayer({ discordId: member.user.id, username: member.user.username, displayName: displayNameOf(member), avatar: member.user.avatar });
}

/**
 * Offer a contract to a prospect for the current or next season. The offer
 * itself (rules, the DM with Accept / Decline) is contracts.offerContracts;
 * the file moves to Offered and the trialist role follows.
 */
export async function offerContract(prospectId: string, seasonId: string, terms: Terms, actor: OfferActor): Promise<Awaited<ReturnType<typeof offerContracts>>> {
  const p = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!p) return { ok: false, error: "That file no longer exists." };
  if (p.stage === "SIGNED") return { ok: false, error: "They have already signed." };
  let player;
  try {
    player = await playerFor(p);
  } catch (e) {
    return { ok: false, error: `Couldn't look them up on Discord: ${explain(e)}` };
  }
  if (!player) return { ok: false, error: p.discordId ? "They aren't in the Discord server (or the bot can't see them), so there is nobody to offer to yet." : "Add their Discord ID to the file first: an offer goes to a Discord account." };
  if (!p.playerId) await prisma.prospect.update({ where: { id: p.id }, data: { playerId: player.id } });

  const r = await offerContracts(seasonId, [{ playerId: player.id, terms }], actor);
  if (!r.ok) return r;
  // offerContracts moved the file to Offered; make the trialist role match whatever the file now says.
  const problems = await syncQuietly(player.id);
  return { ...r, warnings: [...r.warnings, ...problems.filter((w) => !r.warnings.includes(w))] };
}

// --- Settling in -------------------------------------------------------------- //

export async function onboardingFor(p: Prospect) {
  const player = p.playerId ? await prisma.player.findUnique({ where: { id: p.playerId } }) : p.discordId ? await prisma.player.findUnique({ where: { discordId: p.discordId } }) : null;
  const [contract, pattern] = player
    ? await Promise.all([
        prisma.contract.findFirst({ where: { playerId: player.id, state: "ACTIVE", season: { state: { in: ["WINDOW", "ACTIVE"] } } }, select: { id: true } }),
        prisma.availabilityPattern.findUnique({ where: { playerId: player.id }, select: { playerId: true } }),
      ])
    : [null, null];
  const steps = onboardingSteps(p.onboarding, { contract: !!contract, gamertag: !!player?.gamertag, nights: !!pattern });
  return { steps, ...onboardingProgress(steps), player };
}

export async function tick(prospectId: string, step: string, done: boolean): Promise<Res> {
  const p = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!p) return fail("That file no longer exists.");
  const r = tickStep(p.onboarding, step, done);
  if (!r.ok) return fail(r.error);
  await prisma.prospect.update({ where: { id: prospectId }, data: { onboarding: r.value } });
  return { ok: true, warnings: [] };
}

/** DM the welcome links, and tick "Welcome message sent" when it goes. */
export async function sendWelcome(prospectId: string): Promise<Res> {
  const p = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!p) return fail("That file no longer exists.");
  if (!p.discordId) return fail("Add their Discord ID to the file first.");
  try {
    await dm(p.discordId, welcomeDm(p.name));
  } catch (e) {
    return fail(`Couldn't DM them: ${explain(e)}`);
  }
  await tick(prospectId, "welcome", true);
  return { ok: true, warnings: [] };
}

// --- The board ------------------------------------------------------------------ //

export async function loadBoard() {
  const [prospects, notes] = await Promise.all([
    prisma.prospect.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.prospectNote.groupBy({ by: ["prospectId"], _count: { _all: true }, _avg: { rating: true } }),
  ]);
  const summary = new Map(notes.map((n) => [n.prospectId, { notes: n._count._all, avg: n._avg.rating != null ? Math.round(n._avg.rating * 10) / 10 : null }]));
  const byStage = Object.fromEntries(STAGES.map((s) => [s, [] as Prospect[]])) as Record<ProspectStage, Prospect[]>;
  for (const p of prospects) byStage[p.stage].push(p);
  const noted = new Set(notes.map((n) => n.prospectId));
  return {
    byStage,
    summary,
    // On trial, and nobody has written a word about them.
    needNotes: byStage.TRIAL.filter((p) => !noted.has(p.id)),
    active: prospects.filter((p) => ACTIVE_STAGES.includes(p.stage)).length,
  };
}

/** Signed prospects whose checklist isn't finished, oldest signing first. */
export async function settlingIn() {
  const signed = await prisma.prospect.findMany({ where: { stage: "SIGNED" }, orderBy: { signedAt: "asc" } });
  const out: { prospect: Prospect; done: number; total: number }[] = [];
  for (const p of signed) {
    const o = await onboardingFor(p);
    if (o.done < o.total) out.push({ prospect: p, done: o.done, total: o.total });
  }
  return out;
}
