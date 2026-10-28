import { describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({ prisma: {} }));
import { awardMonth, evaluateMilestones, motmWins } from "./recognition";

// Player of the Month and milestones against a stubbed database: the client is
// an argument for exactly this.

const stubDb = (o: { votes?: { eventId: string; nomineeId: string }[]; events?: object[]; award?: object | null; marker?: boolean } = {}) => {
  const created: object[] = [];
  const db = {
    motmVote: { findMany: vi.fn().mockResolvedValue(o.votes ?? []) },
    event: { findMany: vi.fn().mockResolvedValue(o.events ?? []) },
    playerOfTheMonth: {
      findUnique: vi.fn().mockResolvedValue(o.award ?? null),
      create: vi.fn(async ({ data }: { data: object }) => (created.push(data), data)),
    },
    notification: { findUnique: vi.fn().mockResolvedValue(o.marker ? { id: "x" } : null), create: vi.fn().mockResolvedValue({}) },
    eaMatchPlayer: { findMany: vi.fn().mockResolvedValue([]) },
    milestone: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue({}) },
  };
  return { db: db as never, raw: db, created };
};

const v = (eventId: string, nomineeId: string) => ({ eventId, nomineeId });
const closed = (id: string) => ({ id, voteClosesAt: new Date(Date.UTC(2026, 8, 30)), reviewPublishedAt: null });
const now = new Date(Date.UTC(2026, 9, 2, 12));

describe("awardMonth", () => {
  it("won't award a month that isn't over", async () => {
    const { db, created } = stubDb({ votes: [v("e1", "a")] });
    expect(await awardMonth("2026-10", now, db)).toBeNull();
    expect(created).toEqual([]);
  });

  it("awards a finished month once", async () => {
    const { db, created } = stubDb({ votes: [v("e1", "a"), v("e1", "a"), v("e1", "b")], events: [closed("e1")] });
    await awardMonth("2026-09", now, db);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ month: "2026-09", votes: 2, winners: { create: [{ playerId: "a" }] } });
    const again = stubDb({ award: { id: "p" } });
    expect(await awardMonth("2026-09", now, again.db)).toBeNull();
    expect(again.created).toEqual([]);
  });

  it("a month nobody voted in has no award", async () => {
    const { db, created } = stubDb();
    expect(await awardMonth("2026-09", now, db)).toBeNull();
    expect(created).toEqual([]);
  });

  it("a tie on votes goes to the player with more match wins that month", async () => {
    const votes = [v("e1", "a"), v("e1", "a"), v("e1", "b"), v("e2", "b"), v("e2", "b"), v("e3", "b"), v("e3", "a"), v("e4", "a")];
    // totals: a = 2 + 1 + 1 = 4, b = 1 + 2 + 1 = 4. Wins: e1 a, e2 b, e3 tie(a,b), e4 a -> a 3, b 2.
    const { db, created } = stubDb({ votes, events: ["e1", "e2", "e3", "e4"].map(closed) });
    await awardMonth("2026-09", now, db);
    expect(created[0]).toMatchObject({ votes: 4, winners: { create: [{ playerId: "a" }] } });
  });

  it("level on votes and wins, they share it, one row each", async () => {
    const { db, created } = stubDb({ votes: [v("e1", "b"), v("e2", "a")], events: [closed("e1"), closed("e2")] });
    await awardMonth("2026-09", now, db);
    expect(created[0]).toMatchObject({ votes: 1, winners: { create: [{ playerId: "a" }, { playerId: "b" }] } });
  });

  it("matches are the month's by their start, in club time", async () => {
    const { db, raw } = stubDb({ votes: [v("e1", "a")], events: [closed("e1")] });
    await awardMonth("2026-09", now, db);
    const where = raw.motmVote.findMany.mock.calls[0][0].where.event.startsAt;
    // September in New York: 04:00 UTC on the 1st to 04:00 UTC on 1 October.
    expect(where.gte).toEqual(new Date(Date.UTC(2026, 8, 1, 4)));
    expect(where.lt).toEqual(new Date(Date.UTC(2026, 9, 1, 4)));
  });
});

describe("motmWins", () => {
  it("only counts votes that have closed", async () => {
    const open = { id: "e2", voteClosesAt: new Date(Date.UTC(2026, 11, 1)), reviewPublishedAt: null };
    const { db } = stubDb({ votes: [v("e1", "a"), v("e2", "b")], events: [closed("e1"), open] });
    const wins = await motmWins(undefined, undefined, now, db);
    expect([...wins]).toEqual([["a", 1]]);
  });
  it("a published report closes the vote early", async () => {
    const early = { id: "e1", voteClosesAt: new Date(Date.UTC(2026, 11, 1)), reviewPublishedAt: now };
    const { db } = stubDb({ votes: [v("e1", "a")], events: [early] });
    expect([...(await motmWins(undefined, undefined, now, db))]).toEqual([["a", 1]]);
  });
});

describe("evaluateMilestones", () => {
  process.env.EA_CLUB_ID = "111";
  const lines = (n: number) => Array.from({ length: n }, () => ({ playerId: "a", goals: 1, assists: 0, cleanSheet: false, pos: "forward" }));

  it("the very first run records what players have already reached as announced: history isn't news", async () => {
    const { db, raw } = stubDb({ marker: false });
    raw.eaMatchPlayer.findMany.mockResolvedValue(lines(10));
    const fresh = await evaluateMilestones(now, db);
    expect(fresh).toEqual([]);
    const rows = raw.milestone.createMany.mock.calls[0][0].data as { key: string; announcedAt: Date | null }[];
    expect(rows.map((r) => r.key)).toEqual(["apps-1", "apps-10", "goals-1", "goals-10"]);
    expect(rows.every((r) => r.announcedAt)).toBe(true);
    expect(raw.notification.create).toHaveBeenCalledOnce(); // the marker
  });

  it("afterwards new milestones are unannounced and returned", async () => {
    const { db, raw } = stubDb({ marker: true });
    raw.eaMatchPlayer.findMany.mockResolvedValue(lines(10));
    raw.milestone.findMany.mockResolvedValue([{ playerId: "a", key: "apps-1" }, { playerId: "a", key: "goals-1" }]);
    const fresh = await evaluateMilestones(now, db);
    expect(fresh.map((f) => f.key)).toEqual(["apps-10", "goals-10"]);
    const rows = raw.milestone.createMany.mock.calls[0][0].data as { announcedAt: Date | null }[];
    expect(rows.every((r) => r.announcedAt === null)).toBe(true);
    expect(raw.notification.create).not.toHaveBeenCalled();
  });

  it("squad Man of the Match wins count, for players with or without EA lines", async () => {
    const { db, raw } = stubDb({ marker: true, votes: [v("e1", "b")], events: [closed("e1")] });
    await evaluateMilestones(now, db);
    const rows = raw.milestone.createMany.mock.calls[0][0].data as { playerId: string; key: string }[];
    expect(rows).toEqual([expect.objectContaining({ playerId: "b", key: "motm-1" })]);
  });

  it("nothing to do without a club", async () => {
    process.env.EA_CLUB_ID = "";
    const { db, raw } = stubDb();
    expect(await evaluateMilestones(now, db)).toEqual([]);
    expect(raw.eaMatchPlayer.findMany).not.toHaveBeenCalled();
    process.env.EA_CLUB_ID = "111";
  });
});
