import type { Attendance, Position, SignupStatus } from "@prisma/client";
import { BENCH_SLOT_KEYS } from "@/config/formations";
import type { SessionUser } from "./auth";
import { nightStates } from "./availability";
import type { BoardPlayer, BoardSlots } from "./board";
import { briefsOf, eventUrl } from "./events";
import { eventEnd, eventSlots } from "./event-rules";
import type { SlotMap } from "./lineup-rules";
import { hasPerm } from "./permissions";
import { prisma } from "./prisma";
import { liveSquad, toBoardPlayer, type LiveEntry } from "./squad";
import { tacticsRoles } from "./tactics";
import { positionFor } from "./training";
import { dayKey } from "./time";

// Everything the event page shows, loaded once with each viewer's clearance
// applied on the server: anyone sees the roster and the published team sheet;
// attendance, who hasn't answered and the sheet editor are staff only.

export type SignupRow = {
  id: string;
  playerId: string;
  name: string;
  slug: string;
  discordId: string;
  avatar: string | null;
  status: SignupStatus;
  slotKey: string | null;
  prefs: Position[];
  attendance: Attendance | null;
  attendanceMarkedBy: string | null;
};

export async function loadEventPage(id: string, user: SessionUser | null, now = new Date()) {
  const event = await prisma.event.findUnique({ where: { id }, include: { createdBy: { select: { displayName: true } } } });
  if (!event) return null;
  const isStaff = hasPerm(user?.perms, "STAFF");
  const [signupRows, squad, roles, sheetRows, eaMatches] = await Promise.all([
    prisma.eventSignup.findMany({ where: { eventId: id }, include: { player: true }, orderBy: { respondedAt: "asc" } }),
    liveSquad(),
    event.formation ? Promise.resolve(new Map<string, string>()) : tacticsRoles(),
    prisma.eventLineup.findMany({ where: { eventId: id }, include: { player: true } }),
    prisma.eaMatch.findMany({ where: { eventId: id }, orderBy: { playedAt: "asc" } }),
  ]);
  const live = new Map(squad.map((e) => [e.playerId, e]));
  const order = { GOING: 0, MAYBE: 1, OUT: 2 } as const;
  const signups: SignupRow[] = signupRows
    .map((s) => ({
      id: s.id,
      playerId: s.playerId,
      name: s.player.displayName,
      slug: s.player.slug,
      discordId: s.player.discordId,
      avatar: s.player.avatar,
      status: s.status,
      slotKey: s.slotKey,
      prefs: [s.pref1, s.pref2, s.pref3].filter((p): p is Position => !!p),
      attendance: s.attendance,
      attendanceMarkedBy: s.attendanceMarkedBy,
    }))
    .sort((a, b) => order[a.status] - order[b.status]);

  const token = (p: { id: string; displayName: string; discordId: string; avatar: string | null; slug: string }): BoardPlayer => {
    const e = live.get(p.id);
    return e ? toBoardPlayer(e) : { key: p.id, name: p.displayName, discordId: p.discordId, avatar: p.avatar, slug: p.slug };
  };

  // The sign-up sheet: who holds each position.
  const claimed: BoardSlots = {};
  for (const s of signupRows) if (s.slotKey && s.status === "GOING") claimed[s.slotKey] = token(s.player);

  // The published team sheet, drawn with today's numbers.
  const sheet: BoardSlots = {};
  for (const r of sheetRows) sheet[r.slotKey] = token(r.player);

  const me = user ? (signups.find((s) => s.playerId === user.id) ?? null) : null;
  const answered = new Set(signups.map((s) => s.playerId));
  const unanswered: LiveEntry[] = isStaff ? squad.filter((e) => !answered.has(e.playerId)) : [];
  const nights = isStaff && unanswered.length ? await nightStates(unanswered.map((e) => e.playerId), dayKey(event.startsAt)) : new Map<string, "free" | "busy" | "away" | "unknown">();

  // What staff pick from: the squad and anyone who signed up, answers first.
  let editor: { roster: BoardPlayer[]; initial: SlotMap } | null = null;
  if (isStaff && event.formation) {
    const hint = (pid: string) => {
      const s = signups.find((x) => x.playerId === pid);
      return s ? { GOING: "Going", MAYBE: "Maybe", OUT: "Can't make it" }[s.status] : "No answer";
    };
    const people = new Map<string, BoardPlayer>();
    for (const e of squad) people.set(e.playerId, { ...toBoardPlayer(e), hint: hint(e.playerId) });
    for (const s of signupRows) if (s.status !== "OUT" && !people.has(s.playerId)) people.set(s.playerId, { ...token(s.player), hint: hint(s.playerId) });
    const rank = (b: BoardPlayer) => ({ Going: 0, Maybe: 1, "No answer": 2, "Can't make it": 3 })[b.hint as string] ?? 2;
    const saved: SlotMap = Object.fromEntries(sheetRows.map((r) => [r.slotKey, r.playerId]));
    // Before anything is saved, start from the positions people claimed.
    const initial = sheetRows.length ? saved : Object.fromEntries(signupRows.filter((s) => s.slotKey && s.status === "GOING").map((s) => [s.slotKey!, s.playerId]));
    editor = { roster: [...people.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)), initial };
  }

  return {
    event,
    isStaff,
    signups,
    roles,
    claimed,
    sheet,
    sheetPublished: !!event.lineupPublishedAt,
    me,
    mySlot: me?.slotKey ?? null,
    unanswered,
    nights,
    editor,
    eaMatches,
    myPosition: user && event.type && (event.type === "TRAINING" || event.type === "THEORY") ? await positionFor(event, user.id) : null,
    briefs: briefsOf(event.roleBriefs),
    slots: eventSlots(event.formation),
    started: event.startsAt <= now,
    over: eventEnd(event) <= now,
    url: eventUrl(event.id),
    benchKeys: BENCH_SLOT_KEYS,
  };
}

export type EventPage = NonNullable<Awaited<ReturnType<typeof loadEventPage>>>;
