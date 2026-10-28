import { describe, expect, it } from "vitest";
import { avatarHash, buildPlan, epoch, noExisting, position, squadStatus, utc, type ImportOptions, type RawData, type Row } from "./proclubs-import";

const NOW = new Date("2026-10-28T12:00:00Z");
let n = 0;
const opts = (over: Partial<ImportOptions> = {}): ImportOptions => ({
  articleAuthor: "YeeHaw FC Desk",
  oldEnv: {},
  permRoleIds: { MEMBER: [], STAFF: [], MANAGEMENT: [] },
  season: { name: "Season 2", startsAt: new Date("2026-10-20T04:00:00Z"), endsAt: new Date("2027-01-12T04:00:00Z") },
  now: NOW,
  newId: () => `id${++n}`,
  ...over,
});
const plan = (site: Record<string, Row[]>, history: Record<string, Row[]> = {}, o = opts(), e = noExisting()) => buildPlan({ site, history } as RawData, o, e);
const rows = (p: ReturnType<typeof plan>, model: string) => p.tables.find(([m]) => m === model)?.[1] ?? [];

const TEX = "1000000000000000012"; // past 2^53: the reader hands these over as strings
const player = { discord_id: TEX, display_name: "Tex", avatar_url: "https://cdn.discordapp.com/avatars/1000000000000000012/a_abc123.png?size=128", club_role: "Head Coach" };

describe("readers", () => {
  it("parses SQLAlchemy's naive UTC datetimes and epoch seconds", () => {
    expect(utc("2026-10-20 18:30:00.000000")?.toISOString()).toBe("2026-10-20T18:30:00.000Z");
    expect(utc(null)).toBeNull();
    expect(epoch(1792866000)?.toISOString()).toBe("2026-10-24T18:20:00.000Z");
    expect(epoch(1792866000000)?.getUTCFullYear()).toBe(2026);
  });
  it("maps labels onto the enums", () => {
    expect(position("Centre Back")).toBe("CENTRE_BACK");
    expect(position("Stirker")).toBeNull();
    expect(squadStatus("Reserve")).toBe("SUBSTITUTE");
    expect(squadStatus("Starter")).toBe("STARTER");
  });
  it("turns a CDN avatar URL into its hash, and a default avatar into nothing", () => {
    expect(avatarHash("https://cdn.discordapp.com/avatars/1/a_abc.png?size=128")).toBe("a_abc");
    expect(avatarHash("https://cdn.discordapp.com/embed/avatars/2.png")).toBeNull();
  });
});

describe("buildPlan", () => {
  it("creates players with slug, gamertag, club role and avatar hash", () => {
    const p = plan({ players: [player], player_links: [{ discord_user_id: TEX, player_name: "TexTheKid" }] });
    expect(rows(p, "player")).toMatchObject([{ discordId: TEX, displayName: "Tex", slug: "textheKid".toLowerCase(), gamertag: "TexTheKid", clubRole: "HEAD_COACH", avatar: "a_abc123" }]);
  });

  it("puts only live contracts into Season 2 as ACTIVE with no shirt number", () => {
    const p = plan({
      players: [player],
      contracts: [
        { discord_id: TEX, display_name: "Tex", position: "Striker", secondary_position: "Winger", squad_status: "Reserve", weeks: 12, starts_at: "2026-09-01 00:00:00", expires_at: "2026-12-01 00:00:00", ended_at: null },
        { discord_id: "5", display_name: "Gone", squad_status: "Starter", weeks: 4, starts_at: "2026-01-01 00:00:00", expires_at: "2026-02-01 00:00:00", ended_at: "2026-02-01 00:00:00" },
      ],
    });
    expect(rows(p, "season")).toMatchObject([{ name: "Season 2", state: "ACTIVE" }]);
    expect(rows(p, "contract")).toMatchObject([{ shirtNumber: null, state: "ACTIVE", squadStatus: "SUBSTITUTE", position: "STRIKER", secondaryPosition: "WINGER", rolesGranted: true }]);
    expect(p.dropped["contracts already ended or released (kept as roster moves)"]).toBe(1);
    expect(rows(p, "player")).toHaveLength(1); // the released player isn't opened
  });

  it("keeps one live contract per player", () => {
    const base = { discord_id: TEX, display_name: "Tex", squad_status: "Starter", weeks: 8, starts_at: "2026-01-01 00:00:00" };
    const p = plan({ contracts: [{ ...base, expires_at: "2026-12-01 00:00:00" }, { ...base, expires_at: "2026-06-01 00:00:00" }] });
    expect(rows(p, "contract")).toHaveLength(1);
    expect(p.warnings.join()).toMatch(/more than one live contract/);
  });

  it("expands a roster move's answer and confirmation into history rows", () => {
    const p = plan({ roster_moves: [{ id: 1, discord_id: TEX, display_name: "Tex", kind: "offer", position: "Striker", announced_at: "2026-09-01 10:00:00", response: "accepted", responded_at: "2026-09-02 10:00:00", confirmed_at: "2026-09-03 10:00:00", confirmed_by_name: "Viper" }, { id: 2, discord_id: TEX, display_name: "Tex", kind: "staff_offer", position: "Coach", announced_at: "2026-09-01 10:00:00" }] });
    expect(rows(p, "rosterMove").map((m) => m.kind)).toEqual(["OFFER", "ACCEPT", "SIGNING", "STAFF_OFFER"]);
    expect(rows(p, "rosterMove")[3]).toMatchObject({ position: null, note: "Staff role: Coach" });
  });

  it("records milestones as announced, adds the first-run marker, and expands a tied Player of the Month", () => {
    const p = plan({
      milestones: [{ discord_id: TEX, key: "apps-25", label: "25 appearances", achieved_at: "2026-10-01 00:00:00", announced_at: null }],
      player_of_the_month: [{ month: "2026-09", discord_ids: `${TEX},77`, names: "Tex,Moss", votes: 5, awarded_at: "2026-10-01 00:00:00", announced_at: null }],
    });
    expect(rows(p, "milestone")[0].announcedAt).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(rows(p, "notification")).toMatchObject([{ kind: "milestones", key: "initialised" }]);
    expect(rows(p, "potmWinner")).toHaveLength(2);
    expect(rows(p, "playerOfTheMonth")[0].announcedAt).toBeTruthy();
  });

  it("makes articles HTML, marks the roundup byline as AI, never uses the slug 'new', and names cover files safely", () => {
    const png = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]).toString("base64");
    const p = plan({
      articles: [
        { title: "Anything", slug: "new", category: "Transfer", body_html: "<p>x</p>", author_name: "yeehaw fc desk", cover_image: png, cover_thumb: png, published: 1 },
        { title: "Again", slug: "new", body_html: "<p>y</p>", author_name: "Rook", author_discord_id: TEX, discord_message_id: "9" },
      ],
    }, {}, opts({ oldEnv: { NEWS_ANNOUNCE_CHANNEL_ID: "444" } }));
    const [a, b] = rows(p, "article");
    expect(a).toMatchObject({ slug: "new-article", format: "HTML", source: "AI", category: "TRANSFER" });
    expect(b.slug).toBe("new-article-2");
    expect(a.coverImage).toMatch(/^[a-f0-9]{32}\.png$/);
    expect(a.coverThumb).toMatch(/^[a-f0-9]{32}-thumb\.png$/);
    expect(p.covers.map((c) => c.name)).toEqual([a.coverImage, a.coverThumb]);
    expect(b).toMatchObject({ source: "STAFF", discordChannelId: "444", discordMessageId: "9" });
  });

  it("links signups, lineups and votes to the new event ids, and remaps sent reminders", () => {
    const p = plan({
      events: [{ id: 7, title: "Match", event_type: "Match", scheduled_at: "2026-10-30 23:00:00", us_score: 2, opp_score: 1, role_briefs: '{"GK":"x"}' }],
      event_signups: [{ event_id: 7, discord_user_id: TEX, discord_name: "Tex", status: "going", slot_key: "GK", source: "discord", pref_1: "Goalkeeper", attendance: "present" }],
      event_lineups: [{ event_id: 7, slot_key: "GK", discord_user_id: TEX, display_name: "Tex" }, { event_id: 7, slot_key: "ST", discord_user_id: TEX, display_name: "Tex" }],
      motm_votes: [{ event_id: 7, voter_id: TEX, nominee_id: TEX }],
      notifications: [{ kind: "remind", key: `7:${TEX}`, ok: 1 }, { kind: "vote", key: "7" }, { kind: "remind", key: `99:${TEX}` }],
    });
    const event = rows(p, "event")[0];
    expect(event).toMatchObject({ type: "MATCH", usScore: 2, roleBriefs: { GK: "x" } });
    expect(rows(p, "eventSignup")).toMatchObject([{ eventId: event.id, status: "GOING", source: "DISCORD", pref1: "GOALKEEPER", attendance: "PRESENT" }]);
    expect(rows(p, "eventLineup")).toHaveLength(1); // one player per sheet
    const keys = rows(p, "notification").map((x) => x.key);
    expect(keys).toContain(`${event.id}`);
    expect(keys.some((k) => String(k).startsWith(`${event.id}:`))).toBe(true);
    expect(keys).toHaveLength(3); // marker + vote + remind; the one for a vanished event is dropped
  });

  it("matches tactics names to players by gamertag, keeping the rest as text", () => {
    const p = plan({
      players: [player],
      player_links: [{ discord_user_id: TEX, player_name: "TexTheKid" }],
      tactics_slots: [{ formation: "4-3-3", slot_key: "ST", player_name: "textheKID" }, { formation: "4-3-3", slot_key: "GK", player_name: "SomeEAGuy" }],
    });
    const slots = rows(p, "tacticsSlot");
    expect(slots[0]).toMatchObject({ playerId: rows(p, "player")[0].id, playerName: null });
    expect(slots[1]).toMatchObject({ playerId: null, playerName: "SomeEAGuy" });
  });

  it("maps EA history: outcome, lowercase pos, played_at epoch, line linked to a player", () => {
    const p = plan(
      { players: [player], player_links: [{ discord_user_id: TEX, player_name: "TexTheKid" }] },
      {
        matches: [{ match_id: "m1", platform: "common-gen5", club_id: "123", played_at: 1792866000, match_type: "leagueMatch", us_score: 3, opp_score: 1, opp_name: "Them", outcome: null, forfeit: 0, captured_at: 1792866100, opp_club_id: "9" }],
        match_players: [{ match_id: "m1", club_id: "123", player_name: "TexTheKid", pos: "Striker", rating: 8.5, goals: 2, mom: 1, clean_sheet: 0 }, { match_id: "zz", club_id: "123", player_name: "Orphan" }],
      },
    );
    expect(rows(p, "eaMatch")[0]).toMatchObject({ outcome: "W", oppClubId: "9", playedAt: new Date(1792866000 * 1000), forfeit: false });
    expect(rows(p, "eaMatchPlayer")).toMatchObject([{ pos: "striker", mom: true, cleanSheet: false, playerId: rows(p, "player")[0].id }]);
  });

  it("maps club settings, roles and channels, and keeps ROLE_IDS_* when it writes the roles mapping", () => {
    const p = plan(
      { club_settings: [{ key: "match_nights", value: "Tue" }, { key: "discord_role:Starter", value: "11" }, { key: "recruitment:dismissed", value: '["5"]' }] },
      {},
      opts({ oldEnv: { DISCORD_STAFF_ROLE_ID: "99", ROSTER_SQUAD_ROLE_ID: "22", NEWS_ANNOUNCE_CHANNEL_ID: "444" }, permRoleIds: { MEMBER: ["7"], STAFF: [], MANAGEMENT: [] } }),
    );
    const byKey = Object.fromEntries(rows(p, "setting").map((s) => [s.key as string, s.value as Record<string, unknown>]));
    expect(byKey.profile).toEqual({ matchNights: "Tue" });
    expect(byKey.roles).toMatchObject({ perms: { MEMBER: ["7"], MANAGEMENT: ["99"] }, squad: "22", status: { STARTER: "11" } });
    expect(byKey.channels).toMatchObject({ news: "444", roster: "444" });
    expect(byKey["recruitment-dismissed"]).toEqual(["5"]);
  });

  it("reuses existing players and keeps settings already saved", () => {
    const existing = noExisting();
    existing.players.set(TEX, "keep-me");
    existing.slugs.add("tex");
    existing.settingKeys.add("roles");
    const p = plan({ players: [player], contracts: [{ discord_id: TEX, display_name: "Tex", squad_status: "Starter", weeks: 8, starts_at: "2026-01-01 00:00:00", expires_at: "2026-12-01 00:00:00" }], club_settings: [{ key: "discord_role:Starter", value: "11" }] }, {}, opts(), existing);
    expect(rows(p, "player")).toHaveLength(0);
    expect(rows(p, "contract")[0].playerId).toBe("keep-me");
    expect(rows(p, "setting").some((s) => s.key === "roles")).toBe(false);
    expect(p.warnings.join()).toMatch(/already saved/);
  });
});
