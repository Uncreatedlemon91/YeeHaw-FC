import type { PersonnelRequest, Prisma, RequestType, ServiceRecordType, User } from "@prisma/client";
import { MAX_SECONDARY_ROLES, nickname, roleDef, squadDef, stripRank, UNIT_ROLES } from "@/config/unit";
import { addRole, ButtonStyle, dm, editMessage, explain, getMember, linkButton, removeRole, row, sendMessage, setNickname } from "./discord";
import { env } from "./env";
import { hasPerm, type Perm } from "./permissions";
import { prisma } from "./prisma";
import { getChannelConfig } from "./channel-config";
import { getRoleConfig } from "./role-config";
import { fmtDate } from "./time";

// The S1 shop: who may see which parts of a personnel file, billet caps,
// qualification gates, leave, and the request pipeline. Like recruitment,
// the website and the Discord buttons both decide requests through here.

type Person = Pick<User, "id" | "squad" | "unitRole" | "status">;

// --- Clearance ----------------------------------------------------------- //

/** Leads `squad`: holds a leading billet in it, or a Command billet. */
export function leads(user: Person | null | undefined, squad: string | null | undefined): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  const role = roleDef(user.unitRole);
  if (!role?.leads) return false;
  return user.unitRole === "Command" || (!!squad && user.squad === squad);
}

/** Leads any squad at all, i.e. has an S1 queue to work. */
export function isLeader(user: Person | null | undefined): boolean {
  return !!user && user.status === "ACTIVE" && !!roleDef(user.unitRole)?.leads;
}

export type Clearance = {
  /** Command staff: everything, including disciplinary entries. */
  command: boolean;
  /** Squad leadership (or the member themselves): availability, counselling, career, leave reasons. */
  squad: boolean;
  self: boolean;
  label: string;
};

export function clearanceFor(viewer: { perms: readonly Perm[] }, viewerUser: Person | null, member: Person): Clearance {
  const command = hasPerm(viewer.perms, "ADMIN");
  const self = viewerUser?.id === member.id;
  const squad = command || self || leads(viewerUser, member.squad);
  const label = command ? "Command" : self ? "Subject" : squad ? "Squad leadership" : "Unit";
  return { command, squad, self, label };
}

/**
 * Record types a viewer may add to a file. Recruiters log enlistments and
 * notes, squad leadership logs counselling and notes for its own squad, and
 * everything else is Command's call.
 */
export function recordTypesFor(
  perms: readonly Perm[],
  viewer: Person | null,
  memberSquad: string | null,
  isSelf: boolean,
): ServiceRecordType[] {
  if (hasPerm(perms, "ADMIN"))
    return ["ENLISTMENT", "PROMOTION", "AWARD", "COUNSELING", "DISCIPLINARY", "TRANSFER", "DISCHARGE", "NOTE"];
  const types = new Set<ServiceRecordType>();
  if (hasPerm(perms, "RECRUITER")) types.add("ENLISTMENT").add("NOTE");
  if (!isSelf && leads(viewer, memberSquad)) types.add("COUNSELING").add("NOTE");
  return [...types];
}

// --- Service number ------------------------------------------------------ //

/** A stable, typed-looking service number derived from the member's ID. */
export function serviceNumber(u: Pick<User, "id" | "enlistedAt" | "createdAt">): string {
  let h = 0;
  for (const c of u.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const yy = String((u.enlistedAt ?? u.createdAt).getUTCFullYear()).slice(2);
  return `RF-${yy}-${String(h % 1_000_000).padStart(6, "0")}`;
}

// --- Billets ------------------------------------------------------------- //

/** "Squad|Role" -> holders, counting everyone not discharged or a candidate. */
export async function billetFill(): Promise<Map<string, number>> {
  const rows = await prisma.user.groupBy({
    by: ["squad", "unitRole"],
    where: { status: { in: ["ACTIVE", "INACTIVE"] }, squad: { not: null }, unitRole: { not: null } },
    _count: true,
  });
  return new Map(rows.map((r) => [`${r.squad}|${r.unitRole}`, r._count]));
}

export function billetKey(squad: string, role: string) {
  return `${squad}|${role}`;
}

/** Qualification slugs a role needs that the member doesn't hold. */
export function missingQuals(role: string, held: readonly string[]): string[] {
  return (roleDef(role)?.requires ?? []).filter((q) => !held.includes(q));
}

export type RolePayload = { squad: string; primary: string; secondary: string[] };

/**
 * Whether `member` may take `want`. `fill` counts current holders; the
 * member's own seat is discounted so staying put never reads as over cap.
 */
export function checkRoleChange(
  member: Pick<User, "squad" | "unitRole">,
  held: readonly string[],
  want: RolePayload,
  fill: Map<string, number>,
): string | null {
  const squad = squadDef(want.squad);
  if (!squad) return "Pick a squad.";
  if (!UNIT_ROLES.includes(want.primary)) return "Pick a primary role.";
  const cap = squad.billets[want.primary] ?? 0;
  if (!cap) return `${squad.name} has no ${want.primary} billet.`;
  const mine = member.squad === want.squad && member.unitRole === want.primary ? 1 : 0;
  if ((fill.get(billetKey(want.squad, want.primary)) ?? 0) - mine >= cap)
    return `Every ${want.primary} billet in ${squad.name} is filled (${cap}/${cap}).`;
  if (want.secondary.length > MAX_SECONDARY_ROLES) return `Up to ${MAX_SECONDARY_ROLES} secondary roles.`;
  if (want.secondary.includes(want.primary)) return "A secondary role can't repeat the primary.";
  for (const r of [want.primary, ...want.secondary]) {
    if (!UNIT_ROLES.includes(r)) return `Unknown role: ${r}.`;
    const missing = missingQuals(r, held);
    if (missing.length) return `${r} needs ${missing.join(", ")}.`;
  }
  return null;
}

// --- Leave --------------------------------------------------------------- //

/** Approved leave covering `at`, by user ID. */
export async function onLeave(userIds?: string[], at = new Date()) {
  const rows = await prisma.personnelRequest.findMany({
    where: {
      type: "LOA",
      status: "APPROVED",
      startDate: { lte: at },
      endDate: { gte: at },
      ...(userIds ? { userId: { in: userIds } } : {}),
    },
  });
  return new Map(rows.map((r) => [r.userId, r]));
}

/** An LOA's end date is the last day of leave: cover until the end of it. */
export function endOfDay(d: Date) {
  return new Date(d.getTime() + 864e5 - 1);
}

// --- Who decides what ---------------------------------------------------- //

export const REQUEST_LABEL: Record<RequestType, string> = {
  ROLE: "Billet change",
  CALLSIGN: "Callsign change",
  LOA: "Leave of absence",
};

/**
 * Callsigns are Command's call. Role changes within a squad and leave can
 * be decided by that squad's leadership; transfers between squads go to
 * Command. Nobody decides their own request.
 */
export function canDecide(
  viewer: { perms: readonly Perm[] },
  viewerUser: Person | null,
  req: Pick<PersonnelRequest, "type" | "payload" | "userId">,
  requester: Person,
): boolean {
  if (viewerUser?.id === requester.id) return false;
  if (hasPerm(viewer.perms, "ADMIN")) return true;
  if (req.type === "CALLSIGN") return false;
  if (!requester.squad || !leads(viewerUser, requester.squad)) return false;
  if (req.type === "ROLE") return (req.payload as RolePayload).squad === requester.squad;
  return true;
}

export function describe(req: Pick<PersonnelRequest, "type" | "payload" | "startDate" | "endDate">): string {
  if (req.type === "ROLE") {
    const p = req.payload as RolePayload;
    return `${p.squad} · ${p.primary}${p.secondary.length ? ` (secondary: ${p.secondary.join(", ")})` : ""}`;
  }
  if (req.type === "CALLSIGN") return `New callsign: ${(req.payload as { callsign: string }).callsign}`;
  return `${req.startDate ? fmtDate(req.startDate) : "?"} – ${req.endDate ? fmtDate(req.endDate) : "?"}`;
}

// --- The personnel board ------------------------------------------------- //

const COLORS = { PENDING: 0xd4a017, APPROVED: 0x4f7a3a, DENIED: 0x9b2c2c, CANCELLED: 0x555555 } as const;

type WithPeople = PersonnelRequest & { user: User; reviewedBy?: User | null };

export function requestUrl(r: Pick<PersonnelRequest, "userId">) {
  return `${env.siteUrl}/roster/${r.userId}?tab=requests`;
}

export function boardMessage(r: WithPeople, decidedBy?: string) {
  const who = r.user.callsign ?? r.user.discordUsername;
  const fields = [
    { name: "Member", value: `${r.user.rank ?? ""} ${who}`.trim() + ` (<@${r.user.discordId}>)`, inline: true },
    { name: "Current", value: [r.user.squad, r.user.unitRole].filter(Boolean).join(" · ") || "Unassigned", inline: true },
    { name: "Request", value: describe(r), inline: false },
  ];
  if (r.reason) fields.push({ name: "Reason", value: r.reason.slice(0, 1000), inline: false });
  if (r.status !== "PENDING") {
    const verb = { APPROVED: "✅ Approved", DENIED: "❌ Denied", CANCELLED: "Withdrawn by the member" }[r.status];
    const by = r.status === "CANCELLED" ? "" : ` by ${decidedBy ?? r.reviewedBy?.callsign ?? r.reviewedBy?.discordUsername ?? "leadership"}`;
    fields.push({ name: "Decision", value: `${verb}${by}${r.reviewNote ? `\n> ${r.reviewNote}` : ""}`, inline: false });
  }
  return {
    embeds: [
      {
        title: `${REQUEST_LABEL[r.type]}: ${who}`,
        url: requestUrl(r),
        color: COLORS[r.status],
        fields,
        timestamp: r.createdAt.toISOString(),
        footer: { text: `S1 · ${r.status} · ${r.id}` },
      },
    ],
    components: [
      r.status === "PENDING"
        ? row(
            { type: 2, style: ButtonStyle.Success, label: "Approve", custom_id: `per:approve:${r.id}` },
            { type: 2, style: ButtonStyle.Danger, label: "Deny", custom_id: `per:deny:${r.id}` },
            linkButton("Open file", requestUrl(r)),
          )
        : row(linkButton("Open file", requestUrl(r))),
    ],
    allowed_mentions: { parse: [] },
  };
}

export async function postRequest(id: string): Promise<string | null> {
  const { personnel } = await getChannelConfig();
  if (!personnel || !env.botToken) return null;
  const r = await prisma.personnelRequest.findUniqueOrThrow({ where: { id }, include: { user: true } });
  try {
    const msg = await sendMessage(personnel, boardMessage(r));
    await prisma.personnelRequest.update({ where: { id }, data: { boardMessageId: msg.id } });
    return null;
  } catch (e) {
    return `Personnel board: ${explain(e)}`;
  }
}

export async function refreshBoard(id: string, decidedBy?: string) {
  const r = await prisma.personnelRequest.findUniqueOrThrow({ where: { id }, include: { user: true, reviewedBy: true } });
  const { personnel } = await getChannelConfig();
  if (!r.boardMessageId || !personnel || !env.botToken) return;
  await editMessage(personnel, r.boardMessageId, boardMessage(r, decidedBy));
}

// --- Discord role sync --------------------------------------------------- //

type Held = { squad: string | null; roles: string[]; rank?: string | null };

/**
 * Bring the member's squad, billet and (when given) rank roles on Discord in
 * line with `next`. Rank is left alone unless `prev` or `next` names one.
 */
export async function syncUnitRoles(discordId: string, prev: Held, next: Held, reason: string): Promise<string[]> {
  if (!env.botToken) return [];
  const want = new Set<string>();
  const had = new Set<string>();
  const { squads, billets, ranks } = await getRoleConfig();
  if (next.squad && squads[next.squad]) want.add(squads[next.squad]);
  if (prev.squad && squads[prev.squad]) had.add(squads[prev.squad]);
  if (next.rank && ranks[next.rank]) want.add(ranks[next.rank]);
  if (prev.rank && ranks[prev.rank]) had.add(ranks[prev.rank]);
  for (const r of next.roles) if (billets[r]) want.add(billets[r]);
  for (const r of prev.roles) if (billets[r]) had.add(billets[r]);

  const warnings: string[] = [];
  for (const id of had) {
    if (want.has(id)) continue;
    await removeRole(discordId, id, reason).catch((e) => warnings.push(`Remove role: ${explain(e)}`));
  }
  for (const id of want) {
    if (had.has(id)) continue;
    await addRole(discordId, id, reason).catch((e) => warnings.push(`Add role: ${explain(e)}`));
  }
  return warnings;
}

/**
 * Rename the member on Discord to "<rank> <name>", e.g. "Pvt Viper". The
 * name is their callsign, or failing that their current Discord name with
 * any old rank prefix removed. Returns a warning instead of throwing.
 */
export async function applyNickname(
  discordId: string,
  rank: string | null,
  callsign: string | null,
  reason: string,
): Promise<string | null> {
  if (!env.botToken) return null;
  try {
    let name = callsign;
    if (!name) {
      const m = await getMember(discordId);
      if (!m) return null;
      name = stripRank(m.nick) || m.user?.global_name || m.user?.username || null;
    }
    if (!name) return null;
    await setNickname(discordId, nickname(rank, name), reason);
    return null;
  } catch (e) {
    return `Discord nickname: ${explain(e)}`;
  }
}

export const heldRoles = (u: Pick<User, "unitRole" | "secondaryRoles">) =>
  [u.unitRole, ...u.secondaryRoles].filter((r): r is string => !!r);

// --- Deciding ------------------------------------------------------------ //

export type DecideResult = { ok: true; message: string; warnings: string[] } | { ok: false; error: string };

export async function decideRequest(opts: {
  requestId: string;
  approve: boolean;
  reviewer: { id: string; perms: readonly Perm[] };
  reviewerName: string;
  note?: string | null;
}): Promise<DecideResult> {
  const req = await prisma.personnelRequest.findUnique({ where: { id: opts.requestId }, include: { user: true } });
  if (!req) return { ok: false, error: "That request no longer exists." };
  if (req.status !== "PENDING") return { ok: false, error: `This request was already ${req.status.toLowerCase()}.` };
  const reviewerUser = await prisma.user.findUnique({ where: { id: opts.reviewer.id } });
  if (!canDecide(opts.reviewer, reviewerUser, req, req.user))
    return { ok: false, error: "That request isn't yours to decide. Transfers and callsigns go to Command." };

  const member = req.user;
  const note = opts.note?.trim() || null;
  const by = opts.reviewerName;
  const records: Prisma.ServiceRecordCreateManyInput[] = [];
  let userUpdate: Prisma.UserUpdateInput | null = null;

  if (opts.approve && req.type === "ROLE") {
    const want = req.payload as RolePayload;
    const held = (await prisma.userQualification.findMany({ where: { userId: member.id }, include: { qualification: true } })).map(
      (q) => q.qualification.slug,
    );
    // Re-checked now: a billet may have filled since the request went in.
    const err = checkRoleChange(member, held, want, await billetFill());
    if (err) return { ok: false, error: err };
    userUpdate = { squad: want.squad, unitRole: want.primary, secondaryRoles: want.secondary };
    records.push({
      userId: member.id,
      type: "TRANSFER",
      title: `Assigned to ${want.squad}, ${want.primary}`,
      description:
        [
          member.squad || member.unitRole ? `Previously ${[member.squad, member.unitRole].filter(Boolean).join(", ")}.` : null,
          want.secondary.length ? `Secondary: ${want.secondary.join(", ")}.` : null,
          `Approved by ${by}.`,
        ]
          .filter(Boolean)
          .join(" ") || null,
      issuedById: opts.reviewer.id,
    });
  }
  if (opts.approve && req.type === "CALLSIGN") {
    const callsign = (req.payload as { callsign: string }).callsign;
    const taken = await prisma.user.findFirst({
      where: { callsign: { equals: callsign, mode: "insensitive" }, NOT: { id: member.id } },
    });
    if (taken) return { ok: false, error: `Callsign "${callsign}" was taken in the meantime.` };
    userUpdate = { callsign };
    records.push({
      userId: member.id,
      type: "NOTE",
      title: `Callsign changed to ${callsign}`,
      description: member.callsign ? `Previously ${member.callsign}. Approved by ${by}.` : `Approved by ${by}.`,
      issuedById: opts.reviewer.id,
    });
  }
  if (opts.approve && req.type === "LOA") {
    records.push({
      userId: member.id,
      type: "NOTE",
      title: "Leave of absence",
      description: `${describe(req)}. Approved by ${by}.`,
      issuedById: opts.reviewer.id,
    });
  }

  const won = await prisma.$transaction(async (tx) => {
    // Guarded on PENDING so two leaders clicking at once can't both win.
    const claimed = await tx.personnelRequest.updateMany({
      where: { id: req.id, status: "PENDING" },
      data: { status: opts.approve ? "APPROVED" : "DENIED", reviewedById: opts.reviewer.id, reviewNote: note, decidedAt: new Date() },
    });
    if (!claimed.count) return false;
    if (userUpdate) await tx.user.update({ where: { id: member.id }, data: userUpdate });
    if (records.length) await tx.serviceRecord.createMany({ data: records });
    if (opts.approve && req.type === "LOA" && req.startDate && req.endDate) {
      // Excuse them from anything already scheduled in the window that
      // hasn't been debriefed. The AAR form pre-excuses later events too.
      const events = await tx.event.findMany({
        where: { startTime: { gte: req.startDate, lte: req.endDate }, debrief: null },
        select: { id: true },
      });
      for (const e of events) {
        await tx.attendance.upsert({
          where: { eventId_userId: { eventId: e.id, userId: member.id } },
          create: { eventId: e.id, userId: member.id, status: "EXCUSED" },
          update: { status: "EXCUSED" },
        });
      }
    }
    return true;
  });
  if (!won) return { ok: false, error: "Someone else decided this request first." };

  // Discord side: each step independent, failures come back as warnings.
  const warnings: string[] = [];
  const reason = `${REQUEST_LABEL[req.type]} approved by ${by}`;
  if (env.botToken) {
    if (opts.approve && req.type === "ROLE") {
      const want = req.payload as RolePayload;
      warnings.push(
        ...(await syncUnitRoles(
          member.discordId,
          { squad: member.squad, roles: heldRoles(member) },
          { squad: want.squad, roles: [want.primary, ...want.secondary] },
          reason,
        )),
      );
    }
    if (opts.approve && req.type === "CALLSIGN") {
      const callsign = (req.payload as { callsign: string }).callsign;
      await setNickname(member.discordId, nickname(member.rank, callsign), reason).catch((e) =>
        warnings.push(`Nickname: ${explain(e)}`),
      );
    }
    await refreshBoard(req.id, by).catch((e) => warnings.push(`Board post: ${explain(e)}`));
    const verdict = opts.approve ? "approved" : "denied";
    await dm(
      member.discordId,
      `Your ${REQUEST_LABEL[req.type].toLowerCase()} request (${describe(req)}) was **${verdict}** by ${by}.` +
        (note ? `\n> ${note}` : "") +
        `\n${env.siteUrl}/roster/${member.id}`,
    ).catch(() => {});
  }
  return { ok: true, message: opts.approve ? "Approved." : "Denied.", warnings };
}
