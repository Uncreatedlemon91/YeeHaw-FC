import { randomBytes } from "node:crypto";
import { slugify } from "./utils";

// The old Python site's data (proclubs/data/site.db and history.db) turned into
// rows for the new schema. Pure: scripts/migrate-from-proclubs.ts reads the
// SQLite files into plain row objects, calls buildPlan, then writes the plan to
// Postgres in one transaction. Every mapping decision lives here so it can be
// tested without either database.
//
// Dropped on purpose (see the README): clips, streamers, coach notes, comments,
// likes, development goals and reviews, event images (the new site shows none),
// and expired or released contracts (the roster moves keep that history).

export type Row = Record<string, unknown>;
export type RawData = { site: Record<string, Row[]>; history: Record<string, Row[]> };

export type ImportOptions = {
  /** Byline of the AI roundup in the old data (WEEKLY_ARTICLE_AUTHOR): those articles become source AI. */
  articleAuthor: string;
  /** The old site's .env values, for role and channel settings the old site kept there. */
  oldEnv: Record<string, string>;
  /** ROLE_IDS_* of the new site, kept when the roles mapping is first saved. */
  permRoleIds: { MEMBER: string[]; STAFF: string[]; MANAGEMENT: string[] };
  /** Season 2: the placeholder the spec fixes (editable on Admin afterwards). */
  season: { name: string; startsAt: Date; endsAt: Date };
  /** Where the old data's club lives, for the EA tables' own rows (taken from the data itself when absent). */
  now: Date;
  newId?: () => string;
};

/** What is already in the database (only non-empty with --force). */
export type Existing = {
  players: Map<string, string>; // discordId -> id
  slugs: Set<string>;
  gamertags: Set<string>; // lowercase
  articleSlugs: Set<string>;
  settingKeys: Set<string>;
};

export const noExisting = (): Existing => ({ players: new Map(), slugs: new Set(), gamertags: new Set(), articleSlugs: new Set(), settingKeys: new Set() });

/** A cover image to write under UPLOAD_DIR/articles before the rows go in. */
export type CoverFile = { name: string; dataUri: string };

export type Plan = {
  /** [prisma model delegate name, rows], in insertion order (parents before children). */
  tables: [string, Row[]][];
  covers: CoverFile[];
  warnings: string[];
  /** Old rows deliberately not carried over: label -> count. */
  dropped: Record<string, number>;
};

// --- Small readers ------------------------------------------------------------ //

const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const int = (v: unknown): number | null => {
  const x = num(v);
  return x === null ? null : Math.trunc(x);
};
const bool = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

/** SQLAlchemy stores naive UTC datetimes as "2026-10-20 18:30:00.000000". */
export function utc(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s.replace(" ", "T") : s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

/** history.db stores epoch seconds. */
export function epoch(v: unknown): Date | null {
  const x = num(v);
  if (x === null || x <= 0) return null;
  return new Date(x > 1e12 ? x : x * 1000);
}

const sid = (v: unknown): string | null => {
  const s = str(v);
  return s === null ? null : s.trim();
};

// --- Value mappings ---------------------------------------------------------- //

const POSITIONS = new Set(["GOALKEEPER", "CENTRE_BACK", "FULL_BACK", "WING_BACK", "DEFENSIVE_MIDFIELD", "CENTRE_MIDFIELD", "ATTACKING_MIDFIELD", "WINGER", "STRIKER", "ANY_OUTFIELD"]);

/** "Centre Back" -> CENTRE_BACK; anything not on the fixed list -> null. */
export function position(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const key = s.trim().toUpperCase().replace(/\s+/g, "_");
  return POSITIONS.has(key) ? key : null;
}

export function squadStatus(v: unknown): "STARTER" | "ROTATION" | "SUBSTITUTE" {
  const s = (str(v) ?? "").trim().toLowerCase();
  if (s === "starter") return "STARTER";
  if (s === "rotation") return "ROTATION";
  return "SUBSTITUTE"; // "Substitute", and the legacy "Reserve"
}

const CLUB_ROLES: Record<string, string> = { "club president": "PRESIDENT", "head coach": "HEAD_COACH", coach: "COACH" };
const EVENT_TYPES: Record<string, string> = { match: "MATCH", scrim: "SCRIM", tournament: "TOURNAMENT", training: "TRAINING", theory: "THEORY", community: "COMMUNITY" };
const CATEGORIES: Record<string, string> = { news: "NEWS", transfer: "TRANSFER", "match highlight": "MATCH_HIGHLIGHT" };

/** A Discord CDN avatar URL back to the hash the new site stores; default avatars have none. */
export function avatarHash(url: unknown): string | null {
  const m = /\/avatars\/\d+\/([A-Za-z0-9_]+)\.(?:png|jpg|jpeg|webp|gif)/.exec(str(url) ?? "");
  return m ? m[1] : null;
}

export const defaultId = () => "c" + randomBytes(12).toString("hex");

// --- The plan ---------------------------------------------------------------- //

export function buildPlan(raw: RawData, opts: ImportOptions, existing: Existing = noExisting()): Plan {
  const id = opts.newId ?? defaultId;
  const site = (t: string) => raw.site[t] ?? [];
  const hist = (t: string) => raw.history[t] ?? [];
  const warnings: string[] = [];
  const dropped: Record<string, number> = {};
  const drop = (label: string, n: number) => {
    if (n) dropped[label] = (dropped[label] ?? 0) + n;
  };
  const warn = (m: string) => warnings.push(m);

  // People: one Player per Discord id seen anywhere, the players table first
  // (it holds the real profile), the rest named from whatever row mentioned them.
  type Person = { id: string; discordId: string; name: string; avatar: string | null; row?: Row; isNew: boolean };
  const people = new Map<string, Person>();
  const person = (discordId: unknown, name?: unknown, avatarUrl?: unknown): string | null => {
    const d = sid(discordId);
    if (!d || !/^\d+$/.test(d)) return null;
    let p = people.get(d);
    if (!p) {
      const have = existing.players.get(d);
      p = { id: have ?? id(), discordId: d, name: "", avatar: null, isNew: !have };
      people.set(d, p);
    }
    if (!p.name && str(name)) p.name = String(name).trim();
    if (!p.avatar && avatarHash(avatarUrl)) p.avatar = avatarHash(avatarUrl);
    return p.id;
  };
  for (const r of site("players")) {
    person(r.discord_id, r.display_name, r.avatar_url);
    const p = people.get(sid(r.discord_id) ?? "");
    if (p) p.row = r;
  }
  // Gamertags: the link table is the one place a Discord account meets an EA name.
  const linkTag = new Map<string, string>();
  for (const r of site("player_links")) {
    const d = sid(r.discord_user_id);
    const tag = str(r.player_name)?.trim();
    if (d && tag && person(d)) linkTag.set(d, tag);
  }

  // --- Season 2 and the live contracts ------------------------------------------
  const seasonId = id();
  const season = {
    id: seasonId,
    name: opts.season.name,
    startsAt: opts.season.startsAt,
    endsAt: opts.season.endsAt,
    windowOpensAt: opts.season.startsAt,
    state: "ACTIVE",
    startedAt: opts.season.startsAt,
    // Already announced on the old site; the season job must not post the squad again.
    announcedAt: opts.season.startsAt,
  };
  const liveByPlayer = new Map<string, Row>();
  let nonLive = 0;
  for (const c of site("contracts")) {
    if (c.ended_at) {
      nonLive++;
      continue;
    }
    const d = sid(c.discord_id);
    if (!d || !person(d, c.display_name, c.avatar_url)) continue;
    const have = liveByPlayer.get(d);
    if (have) {
      warn(`${c.display_name}: more than one live contract; the one expiring last is kept.`);
      if ((str(c.expires_at) ?? "") <= (str(have.expires_at) ?? "")) continue;
    }
    liveByPlayer.set(d, c);
  }
  drop("contracts already ended or released (kept as roster moves)", nonLive);
  const contracts = [...liveByPlayer.entries()].map(([d, c]) => ({
    id: id(),
    seasonId,
    playerId: people.get(d)!.id,
    shirtNumber: null,
    squadStatus: squadStatus(c.squad_status),
    position: position(c.position),
    secondaryPosition: position(c.secondary_position),
    captaincy: "NONE",
    state: "ACTIVE",
    offeredAt: utc(c.starts_at) ?? opts.season.startsAt,
    respondedAt: utc(c.starts_at) ?? opts.season.startsAt,
    // The old site's role sync already gave these players their Discord roles.
    rolesGranted: true,
    note: `Carried over from the old site (${int(c.weeks) ?? "?"}-week deal, ${utc(c.expires_at)?.toISOString().slice(0, 10) ?? "no end date"}). Shirt number to be assigned.`,
  }));

  // --- Roster moves, as history ----------------------------------------------
  const moves: Row[] = [];
  const MOVE_KIND: Record<string, string> = { offer: "OFFER", release: "RELEASE", renewal: "RENEWAL", staff_offer: "STAFF_OFFER" };
  for (const m of site("roster_moves")) {
    const kind = MOVE_KIND[str(m.kind) ?? ""];
    const playerId = person(m.discord_id, m.display_name, m.avatar_url);
    if (!kind || !playerId) {
      warn(`Roster move ${m.id}: unknown kind or player, skipped.`);
      continue;
    }
    const staffRole = kind === "STAFF_OFFER" ? str(m.position) : null;
    const base = {
      playerId,
      displayName: String(m.display_name ?? "").trim() || "Unknown",
      position: staffRole ? null : position(m.position),
      secondaryPosition: position(m.secondary_position),
      squadStatus: m.squad_status ? squadStatus(m.squad_status) : null,
      actorId: person(m.announced_by_discord_id, m.announced_by_name),
      actorName: str(m.announced_by_name),
    };
    const note = [staffRole ? `Staff role: ${staffRole}` : null, str(m.note)].filter(Boolean).join("\n") || null;
    moves.push({ id: id(), kind, ...base, note, discordChannelId: str(m.discord_channel_id), discordMessageId: str(m.discord_message_id), createdAt: utc(m.announced_at) ?? opts.now });
    const answer = str(m.response);
    if (answer === "accepted" || answer === "declined") {
      moves.push({ id: id(), kind: answer === "accepted" ? "ACCEPT" : "DECLINE", ...base, actorId: playerId, actorName: base.displayName, note: null, createdAt: utc(m.responded_at) ?? utc(m.announced_at) ?? opts.now });
    }
    if (m.confirmed_at) {
      moves.push({ id: id(), kind: "SIGNING", ...base, actorId: null, actorName: str(m.confirmed_by_name), note: null, discordMessageId: str(m.confirm_message_id), createdAt: utc(m.confirmed_at) ?? opts.now });
    }
  }

  // --- Service record, milestones, Player of the Month ---------------------------
  const serviceEntries = site("service_entries").flatMap((e) => {
    const playerId = person(e.discord_id);
    const kind = (str(e.kind) ?? "").toUpperCase();
    if (!playerId || !["COMMENDATION", "WARNING", "NOTE"].includes(kind)) return [];
    return [{
      id: id(),
      playerId,
      kind,
      body: String(e.body ?? ""),
      authorId: person(e.author_discord_id, e.author_name),
      authorName: str(e.author_name) ?? "Staff",
      occurredAt: utc(e.occurred_at) ?? utc(e.created_at) ?? opts.now,
      createdAt: utc(e.created_at) ?? opts.now,
    }];
  });
  const milestones = site("milestones").flatMap((m) => {
    const playerId = person(m.discord_id);
    if (!playerId || !str(m.key)) return [];
    const at = utc(m.achieved_at) ?? opts.now;
    // History is not news: everything is recorded as already announced.
    return [{ id: id(), playerId, key: String(m.key), label: String(m.label ?? m.key), achievedAt: at, announcedAt: utc(m.announced_at) ?? at }];
  });
  const potm: Row[] = [];
  const potmWinners: Row[] = [];
  for (const p of site("player_of_the_month")) {
    const month = str(p.month);
    if (!month) continue;
    const potmId = id();
    const names = String(p.names ?? "").split(",");
    const winnerIds = String(p.discord_ids ?? "").split(",").map((x, i) => person(x.trim(), names[i]?.trim())).filter((x): x is string => !!x);
    const at = utc(p.awarded_at) ?? opts.now;
    potm.push({ id: potmId, month, votes: int(p.votes) ?? 0, awardedAt: at, announcedAt: utc(p.announced_at) ?? at });
    for (const playerId of new Set(winnerIds)) potmWinners.push({ potmId, playerId });
  }

  // --- Articles ----------------------------------------------------------------
  const covers: CoverFile[] = [];
  const takenSlugs = new Set(existing.articleSlugs);
  const articles = site("articles").map((a) => {
    let slug = slugify(String(a.slug ?? a.title ?? "")) || "article";
    if (slug === "new") slug = "new-article"; // /news/new is the editor
    for (let n = 2; takenSlugs.has(slug); n++) slug = `${slug.replace(/-\d+$/, "")}-${n}`;
    takenSlugs.add(slug);
    const authorName = str(a.author_name) ?? "YeeHaw FC";
    const stem = randomBytes(16).toString("hex");
    let coverImage: string | null = null;
    let coverThumb: string | null = null;
    const cover = dataUri(a.cover_image);
    if (cover) {
      coverImage = `${stem}.${cover.ext}`;
      covers.push({ name: coverImage, dataUri: String(a.cover_image) });
      const thumb = dataUri(a.cover_thumb);
      if (thumb) {
        coverThumb = `${stem}-thumb.${thumb.ext}`;
        covers.push({ name: coverThumb, dataUri: String(a.cover_thumb) });
      } else coverThumb = coverImage; // rows saved before thumbnails existed
    } else if (str(a.cover_image)) warn(`Article "${a.title}": cover image is not a PNG/JPEG/WebP data URI, left out.`);
    return {
      id: id(),
      title: String(a.title ?? "Untitled"),
      slug,
      category: CATEGORIES[(str(a.category) ?? "").toLowerCase()] ?? "NEWS",
      summary: str(a.summary),
      body: String(a.body_html ?? ""),
      format: "HTML",
      coverImage,
      coverThumb,
      coverFocalX: num(a.cover_focal_x) ?? 50,
      coverFocalY: num(a.cover_focal_y) ?? 50,
      source: authorName.trim().toLowerCase() === opts.articleAuthor.trim().toLowerCase() ? "AI" : "STAFF",
      authorId: person(a.author_discord_id, authorName, a.author_avatar),
      authorName,
      published: a.published === undefined ? true : bool(a.published),
      publishedAt: utc(a.published_at),
      createdAt: utc(a.published_at) ?? opts.now,
      updatedAt: utc(a.updated_at) ?? utc(a.published_at) ?? opts.now,
      // The channel isn't stored with an article; the news channel's old id fills it in.
      discordChannelId: str(a.discord_message_id) ? str(opts.oldEnv.NEWS_ANNOUNCE_CHANNEL_ID) : null,
      discordMessageId: str(a.discord_message_id) && str(opts.oldEnv.NEWS_ANNOUNCE_CHANNEL_ID) ? str(a.discord_message_id) : null,
      discordReactionCount: int(a.discord_reaction_count),
    };
  });

  // --- Events and everything hanging off them -----------------------------------
  const eventIds = new Map<string, string>();
  const events = site("events").map((e) => {
    const newId = id();
    eventIds.set(String(e.id), newId);
    const type = EVENT_TYPES[(str(e.event_type) ?? "").toLowerCase()];
    if (!type) warn(`Event "${e.title}": unknown type "${e.event_type}", imported as Community.`);
    let roleBriefs: unknown = null;
    if (str(e.role_briefs)) {
      try {
        roleBriefs = JSON.parse(String(e.role_briefs));
      } catch {
        warn(`Event "${e.title}": role briefs were not valid JSON, left out.`);
      }
    }
    return {
      id: newId,
      title: String(e.title ?? "Event"),
      type: type ?? "COMMUNITY",
      opponent: str(e.opponent),
      description: String(e.description ?? ""),
      startsAt: utc(e.scheduled_at) ?? opts.now,
      createdAt: utc(e.created_at) ?? opts.now,
      discordChannelId: str(e.discord_channel_id),
      discordMessageId: str(e.discord_message_id),
      signupsOpen: e.signups_open === undefined ? true : bool(e.signups_open),
      formation: str(e.formation),
      lineupPublishedAt: utc(e.lineup_published_at),
      lineupMessageId: str(e.lineup_message_id),
      usScore: int(e.us_score),
      oppScore: int(e.opp_score),
      result: str(e.result),
      reviewNotes: str(e.review_notes),
      reviewClips: str(e.review_clips),
      reviewPublishedAt: utc(e.review_published_at),
      reviewPublishedBy: str(e.review_published_by),
      voteOpenedAt: utc(e.vote_opened_at),
      voteClosesAt: utc(e.vote_closes_at),
      voteMessageId: str(e.vote_message_id),
      sessionObjective: str(e.session_objective),
      sessionPlan: str(e.session_plan),
      ...(roleBriefs === null ? {} : { roleBriefs }), // a Json column takes no plain null
      sessionReview: str(e.session_review),
      sessionReviewedBy: str(e.session_reviewed_by),
    };
  });
  drop("event images", site("events").filter((e) => str(e.image)).length);
  const ev = (v: unknown) => eventIds.get(String(v)) ?? null;

  const seen = (set: Set<string>, key: string) => (set.has(key) ? true : (set.add(key), false));
  const signupKeys = new Set<string>();
  const eventSignups = site("event_signups").flatMap((s) => {
    const eventId = ev(s.event_id);
    const playerId = person(s.discord_user_id, s.discord_name, s.discord_avatar);
    if (!eventId || !playerId || seen(signupKeys, `${eventId}|${playerId}`)) return [];
    const status = (str(s.status) ?? "going").toUpperCase();
    const att = (str(s.attendance) ?? "").toUpperCase();
    return [{
      id: id(),
      eventId,
      playerId,
      status: ["GOING", "MAYBE", "OUT"].includes(status) ? status : "GOING",
      slotKey: str(s.slot_key),
      source: str(s.source)?.toLowerCase() === "discord" ? "DISCORD" : "SITE",
      pref1: position(s.pref_1),
      pref2: position(s.pref_2),
      pref3: position(s.pref_3),
      respondedAt: utc(s.responded_at) ?? opts.now,
      attendance: ["PRESENT", "ABSENT", "EXCUSED"].includes(att) ? att : null,
      attendanceMarkedBy: str(s.attendance_marked_by),
      attendanceMarkedAt: utc(s.attendance_marked_at),
    }];
  });
  const slotKeys = new Set<string>();
  const lineupPlayers = new Set<string>();
  const eventLineups = site("event_lineups").flatMap((l) => {
    const eventId = ev(l.event_id);
    const playerId = person(l.discord_user_id, l.display_name);
    if (!eventId || !playerId || str(l.slot_key) === null) return [];
    if (seen(slotKeys, `${eventId}|${l.slot_key}`) || seen(lineupPlayers, `${eventId}|${playerId}`)) return [];
    return [{ id: id(), eventId, slotKey: String(l.slot_key), playerId }];
  });
  const eventTierInvites = site("event_tier_invites").flatMap((t) => {
    const eventId = ev(t.event_id);
    return eventId ? [{ id: id(), eventId, tierKey: String(t.tier_key), roleId: String(t.role_id), invitedAt: utc(t.invited_at) ?? opts.now, memberCount: int(t.member_count) ?? 0 }] : [];
  });
  const ratingKeys = new Set<string>();
  const matchRatings = site("match_ratings").flatMap((r) => {
    const eventId = ev(r.event_id);
    const playerId = person(r.discord_id, r.display_name);
    if (!eventId || !playerId || seen(ratingKeys, `${eventId}|${playerId}`)) return [];
    return [{ id: id(), eventId, playerId, selfRating: int(r.self_rating), coachRating: int(r.coach_rating), coachComment: str(r.coach_comment), coachName: str(r.coach_name) }];
  });
  const voteKeys = new Set<string>();
  const motmVotes = site("motm_votes").flatMap((v) => {
    const eventId = ev(v.event_id);
    const voterId = person(v.voter_id);
    const nomineeId = person(v.nominee_id);
    if (!eventId || !voterId || !nomineeId || seen(voteKeys, `${eventId}|${voterId}`)) return [];
    return [{ id: id(), eventId, voterId, nomineeId, createdAt: utc(v.created_at) ?? opts.now }];
  });

  // Reminders and votes already sent must not go out again for old events.
  const notifications: Row[] = [{ id: id(), kind: "milestones", key: "initialised", sentAt: opts.now, ok: true, detail: null }];
  let otherNotifications = 0;
  for (const n of site("notifications")) {
    const kind = str(n.kind);
    const key = str(n.key) ?? "";
    let mapped: string | null = null;
    if (kind === "vote") mapped = ev(key);
    else if (kind === "remind") {
      const [eventKey, discordId] = key.split(":");
      const eventId = ev(eventKey);
      const playerId = discordId ? person(discordId) : null;
      mapped = eventId && playerId ? `${eventId}:${playerId}` : null;
    }
    if (!kind || !mapped) {
      otherNotifications++;
      continue;
    }
    notifications.push({ id: id(), kind, key: mapped, sentAt: utc(n.sent_at) ?? opts.now, ok: n.ok === undefined ? true : bool(n.ok), detail: str(n.detail) });
  }
  drop("notifications of other kinds (the new jobs keep their own)", otherNotifications);

  // --- Tactics, set pieces, training, availability, recruitment -------------------
  const tagToPlayer = new Map<string, string>();
  const usedTags = new Set(existing.gamertags);
  const gamertagOf = new Map<string, string>();
  for (const [d, tag] of linkTag) {
    const p = people.get(d)!;
    if (!p.isNew) {
      warn(`${tag}: ${p.name || d} already has a player record on the new site; gamertag not linked (set it on their hub).`);
      usedTags.add(tag.toLowerCase()); // so another account can't take it
      continue;
    }
    if (usedTags.has(tag.toLowerCase())) {
      warn(`Gamertag "${tag}" is linked to more than one Discord account; kept on the first.`);
      continue;
    }
    usedTags.add(tag.toLowerCase());
    gamertagOf.set(d, tag);
    tagToPlayer.set(tag.toLowerCase(), p.id);
  }

  const tacticsBoard = site("tactics_board").slice(0, 1).map((b) => ({ id: 1, activeFormation: str(b.active_formation) ?? "4-3-3", updatedByName: str(b.updated_by_name) }));
  const tacticsSlots = site("tactics_slots").flatMap((t) => {
    if (!str(t.formation) || !str(t.slot_key)) return [];
    const name = str(t.player_name);
    const playerId = name ? tagToPlayer.get(name.trim().toLowerCase()) ?? null : null;
    return [{ id: id(), formation: String(t.formation), slotKey: String(t.slot_key), playerId, playerName: playerId ? null : name }];
  });
  const setPieces = site("set_pieces").map((s) => {
    const takerId = person(s.taker_id, s.taker_name);
    const routine = takerId || !str(s.taker_name) ? str(s.routine) : [`Taker: ${s.taker_name}`, str(s.routine)].filter(Boolean).join("\n");
    return { id: id(), name: String(s.name ?? "Routine"), kind: String(s.kind ?? "Corner"), side: str(s.side), takerId, routine, targets: str(s.targets), position: int(s.position) ?? 0, updatedBy: str(s.updated_by), createdAt: utc(s.created_at) ?? opts.now };
  });
  const SUGGESTION = ["OPEN", "PLANNED", "DONE", "DECLINED"];
  const trainingSuggestions = site("training_suggestions").flatMap((t) => {
    const playerId = person(t.discord_id, t.display_name);
    if (!playerId) return [];
    const status = (str(t.status) ?? "open").toUpperCase();
    return [{ id: id(), playerId, body: String(t.body ?? ""), status: SUGGESTION.includes(status) ? status : "OPEN", staffNote: str(t.staff_note), handledBy: str(t.handled_by), createdAt: utc(t.created_at) ?? opts.now }];
  });
  const availabilityPatterns = site("availability_patterns").flatMap((a) => {
    const playerId = person(a.discord_id);
    return playerId ? [{ playerId, days: /^[01]{7}$/.test(String(a.days)) ? String(a.days) : "0000000", note: str(a.note) }] : [];
  });
  const date = (v: unknown) => {
    const s = str(v);
    return s ? new Date(s.slice(0, 10) + "T00:00:00Z") : null;
  };
  const availabilityAway = site("availability_away").flatMap((a) => {
    const playerId = person(a.discord_id);
    const startsOn = date(a.starts_on);
    const endsOn = date(a.ends_on);
    return playerId && startsOn && endsOn ? [{ id: id(), playerId, startsOn, endsOn, note: str(a.note), createdAt: utc(a.created_at) ?? opts.now }] : [];
  });
  const STAGES = ["PROSPECT", "TRIAL", "OFFERED", "SIGNED", "REJECTED"];
  const prospectIds = new Map<string, string>();
  const prospects = site("prospects").map((p) => {
    const newId = id();
    prospectIds.set(String(p.id), newId);
    const d = sid(p.discord_id);
    const stage = (str(p.stage) ?? "prospect").toUpperCase();
    return {
      id: newId,
      name: String(p.name ?? "Unknown"),
      // Linked when that person already has a file; otherwise the id is kept and the link forms when they sign in.
      playerId: d && people.has(d) ? people.get(d)!.id : null,
      discordId: d,
      gamertag: str(p.gamertag),
      position: position(p.position),
      secondaryPosition: position(p.secondary_position),
      stage: STAGES.includes(stage) ? stage : "PROSPECT",
      source: str(p.source),
      addedBy: str(p.added_by),
      signedAt: utc(p.signed_at),
      onboarding: (str(p.onboarding) ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      createdAt: utc(p.created_at) ?? opts.now,
    };
  });
  const prospectNotes = site("prospect_notes").flatMap((n) => {
    const prospectId = prospectIds.get(String(n.prospect_id));
    if (!prospectId) return [];
    return [{ id: id(), prospectId, eventId: ev(n.event_id), rating: int(n.rating), body: String(n.body ?? ""), authorName: str(n.author) ?? "Staff", discordMessageId: str(n.discord_message_id), createdAt: utc(n.created_at) ?? opts.now }];
  });

  // --- Settings -------------------------------------------------------------------
  const settings: Row[] = [];
  const addSetting = (key: string, value: unknown) => {
    if (existing.settingKeys.has(key)) warn(`Setting "${key}" is already saved on the new site; the old value was not imported.`);
    else settings.push({ key, value });
  };
  const cs = new Map(site("club_settings").map((r) => [String(r.key), str(r.value)]));
  const profile: Record<string, string> = {};
  const PROFILE_KEYS: [string, string][] = [["headline", "headline"], ["about", "about"], ["match_nights", "matchNights"], ["region", "region"], ["platform", "platform"], ["play_style", "playStyle"], ["recruiting", "recruiting"]];
  for (const [oldKey, newKey] of PROFILE_KEYS) if (cs.has(oldKey)) profile[newKey] = cs.get(oldKey) ?? "";
  if (Object.keys(profile).length) addSetting("profile", profile);

  const env = opts.oldEnv;
  const roleFor = (key: string, envName: string) => {
    const stored = cs.get(`discord_role:${key}`);
    return (stored !== undefined ? stored ?? "" : env[envName] ?? "").trim();
  };
  const idOnly = (v: string) => (/^\d+$/.test(v) ? v : "");
  const roles = {
    perms: {
      MEMBER: opts.permRoleIds.MEMBER,
      STAFF: opts.permRoleIds.STAFF,
      // The old staff role was the way into management on the old site.
      MANAGEMENT: [...new Set([...opts.permRoleIds.MANAGEMENT, idOnly(env.DISCORD_STAFF_ROLE_ID ?? "")].filter(Boolean))],
    },
    clubRoles: { PRESIDENT: idOnly(roleFor("Club President", "ROLE_CLUB_PRESIDENT_ID")), HEAD_COACH: idOnly(roleFor("Head Coach", "ROLE_HEAD_COACH_ID")), COACH: idOnly(roleFor("Coach", "ROLE_COACH_ID")) },
    squad: idOnly(roleFor("Squad", "ROSTER_SQUAD_ROLE_ID")),
    status: { STARTER: idOnly(roleFor("Starter", "ROLE_STARTER_ID")), ROTATION: idOnly(roleFor("Rotation", "ROLE_ROTATION_ID")), SUBSTITUTE: idOnly(roleFor("Substitute", "ROLE_SUBSTITUTE_ID")) },
    trialist: idOnly(roleFor("Trialist", "ROLE_TRIALIST_ID")),
  };
  const anyRole = roles.perms.MANAGEMENT.length || Object.values(roles.clubRoles).some(Boolean) || roles.squad || Object.values(roles.status).some(Boolean) || roles.trialist;
  if (anyRole) addSetting("roles", roles);

  const channels = {
    events: idOnly(env.EVENTS_ANNOUNCE_CHANNEL_ID || env.MATCHDAY_CHANNEL_ID || env.EVENT_THREAD_CHANNEL_ID || ""),
    news: idOnly(env.NEWS_ANNOUNCE_CHANNEL_ID ?? ""),
    roster: idOnly(env.ROSTER_ANNOUNCE_CHANNEL_ID || env.NEWS_ANNOUNCE_CHANNEL_ID || ""),
    recruitment: idOnly(env.RECRUITMENT_CHANNEL_ID ?? ""),
    management: "",
    recognition: "",
  };
  if (Object.values(channels).some(Boolean)) addSetting("channels", channels);

  const dismissed = cs.get("recruitment:dismissed");
  if (dismissed) {
    try {
      const list = JSON.parse(dismissed);
      if (Array.isArray(list) && list.length) addSetting("recruitment-dismissed", list.map(String));
    } catch {
      warn("recruitment:dismissed was not valid JSON, left out.");
    }
  }

  // --- EA history ---------------------------------------------------------------------
  const eaClubSnapshots = hist("club_snapshots").map((s) => ({
    id: id(), platform: String(s.platform), clubId: String(s.club_id), capturedAt: epoch(s.captured_at) ?? opts.now,
    division: str(s.division), bestDivision: str(s.best_division), points: int(s.points), skillRating: int(s.skill_rating),
    wins: int(s.wins), losses: int(s.losses), ties: int(s.ties), goals: int(s.goals), goalsAgainst: int(s.goals_against),
    promotions: int(s.promotions), relegations: int(s.relegations), teamSize: int(s.team_size),
  }));
  const matchRef = new Map<string, string>();
  const eaMatches = hist("matches").flatMap((m) => {
    const key = `${m.match_id}|${m.club_id}`;
    if (matchRef.has(key)) return [];
    const newId = id();
    matchRef.set(key, newId);
    const us = int(m.us_score);
    const opp = int(m.opp_score);
    const o = str(m.outcome);
    const outcome = o === "W" || o === "L" || o === "D" ? o : us !== null && opp !== null ? (us > opp ? "W" : us < opp ? "L" : "D") : "D";
    return [{
      id: newId, matchId: String(m.match_id), platform: String(m.platform), clubId: String(m.club_id), playedAt: epoch(m.played_at),
      matchType: String(m.match_type), usScore: us, oppScore: opp, oppName: str(m.opp_name), oppClubId: str(m.opp_club_id),
      outcome, forfeit: bool(m.forfeit), capturedAt: epoch(m.captured_at) ?? opts.now,
    }];
  });
  const lineKeys = new Set<string>();
  const eaMatchPlayers = hist("match_players").flatMap((p) => {
    const ref = matchRef.get(`${p.match_id}|${p.club_id}`);
    const name = str(p.player_name);
    if (!ref || !name || seen(lineKeys, `${ref}|${name}`)) return [];
    return [{
      id: id(), matchRef: ref, playerName: name, playerId: tagToPlayer.get(name.toLowerCase()) ?? null,
      pos: str(p.pos)?.toLowerCase() ?? null, rating: num(p.rating), goals: int(p.goals), assists: int(p.assists), shots: int(p.shots),
      passesMade: int(p.passes_made), passAttempts: int(p.pass_attempts), tacklesMade: int(p.tackles_made), tackleAttempts: int(p.tackle_attempts),
      saves: int(p.saves), mom: bool(p.mom), redCards: int(p.red_cards), cleanSheet: bool(p.clean_sheet), minutesPlayed: int(p.minutes_played),
    }];
  });
  const eaLeagueClubs = hist("league_clubs").map((c) => ({ platform: String(c.platform), clubId: String(c.club_id), label: str(c.label), addedAt: epoch(c.added_at) ?? opts.now, pinned: bool(c.pinned) }));
  const eaMemberTotals = hist("member_totals").map((t) => ({
    platform: String(t.platform), clubId: String(t.club_id), playerName: String(t.player_name), gamesPlayed: int(t.games_played), goals: int(t.goals), assists: int(t.assists),
    mom: int(t.mom), passesMade: int(t.passes_made), passSuccess: num(t.pass_success), tacklesMade: int(t.tackles_made), tackleSuccess: num(t.tackle_success),
    shotSuccess: num(t.shot_success), ratingAvg: num(t.rating_avg), cleanSheets: int(t.clean_sheets), redCards: int(t.red_cards), capturedAt: epoch(t.captured_at) ?? opts.now,
  }));
  const eaSquadMembers = hist("squad_members").map((m) => ({ platform: String(m.platform), clubId: String(m.club_id), playerName: String(m.player_name), joinedAt: epoch(m.joined_at) ?? opts.now }));
  const eaSquadMoves = hist("squad_moves").map((m) => ({ id: id(), platform: String(m.platform), clubId: String(m.club_id), playerName: String(m.player_name), move: String(m.move), movedAt: epoch(m.moved_at) ?? opts.now }));

  for (const t of ["coach_notes", "comments", "likes", "clips", "streamers", "dev_goals", "dev_reviews"]) drop(`${t.replace(/_/g, " ")} (feature dropped)`, site(t).length);

  // --- Players last, now that every id is known; parents are inserted first. ------
  const slugs = new Set(existing.slugs);
  const players = [...people.values()]
    .filter((p) => p.isNew)
    .sort((a, b) => a.discordId.localeCompare(b.discordId))
    .map((p) => {
      const displayName = p.name || `Member ${p.discordId.slice(-4)}`;
      const tag = gamertagOf.get(p.discordId) ?? null;
      const root = slugify(tag ?? displayName) || "player";
      let slug = root;
      for (let n = 2; slugs.has(slug); n++) slug = `${root}-${n}`;
      slugs.add(slug);
      const r = p.row;
      return {
        id: p.id,
        discordId: p.discordId,
        discordUsername: displayName, // the old site kept no username; the next sign-in or member sync replaces it
        displayName,
        avatar: p.avatar,
        slug,
        gamertag: tag,
        clubRole: CLUB_ROLES[(str(r?.club_role) ?? "").toLowerCase()] ?? null,
        clubRoleSince: utc(r?.club_role_since),
        preferredFoot: str(r?.preferred_foot),
        archetype: str(r?.archetype),
        bio: str(r?.bio),
        lastLoginAt: utc(r?.last_seen_at),
        createdAt: utc(r?.created_at) ?? opts.now,
      };
    });

  const tables: [string, Row[]][] = [
    ["player", players],
    ["season", [season]],
    ["contract", contracts],
    ["rosterMove", moves],
    ["serviceEntry", serviceEntries],
    ["milestone", milestones],
    ["playerOfTheMonth", potm],
    ["potmWinner", potmWinners],
    ["article", articles],
    ["event", events],
    ["eventTierInvite", eventTierInvites],
    ["eventSignup", eventSignups],
    ["eventLineup", eventLineups],
    ["matchRating", matchRatings],
    ["motmVote", motmVotes],
    ["notification", notifications],
    ["tacticsBoard", tacticsBoard],
    ["tacticsSlot", tacticsSlots],
    ["setPiece", setPieces],
    ["trainingSuggestion", trainingSuggestions],
    ["availabilityPattern", availabilityPatterns],
    ["availabilityAway", availabilityAway],
    ["prospect", prospects],
    ["prospectNote", prospectNotes],
    ["setting", settings],
    ["eaClubSnapshot", eaClubSnapshots],
    ["eaMatch", eaMatches],
    ["eaMatchPlayer", eaMatchPlayers],
    ["eaLeagueClub", eaLeagueClubs],
    ["eaMemberTotal", eaMemberTotals],
    ["eaSquadMember", eaSquadMembers],
    ["eaSquadMove", eaSquadMoves],
  ];
  return { tables: tables.filter(([, rows]) => rows.length), covers, warnings, dropped };
}

/** A cover as stored by the old images.py: "data:image/webp;base64,...". Null for anything else. */
export function dataUri(v: unknown): { ext: "png" | "jpg" | "webp"; bytes: Buffer } | null {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s.exec(str(v) ?? "");
  if (!m) return null;
  return { ext: m[1] === "png" ? "png" : m[1] === "webp" ? "webp" : "jpg", bytes: Buffer.from(m[2], "base64") };
}
