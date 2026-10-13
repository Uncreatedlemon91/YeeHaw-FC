import type { RecruitmentApplication, User } from "@prisma/client";
import { APPLICATION_QUESTIONS, nickname, RANKS, RECRUIT_RANK, rankName, UNIT } from "@/config/unit";
import {
  addRole,
  ButtonStyle,
  dm,
  editMessage,
  explain,
  linkButton,
  removeRole,
  row,
  sendMessage,
  setNickname,
} from "./discord";
import { env } from "./env";
import { prisma } from "./prisma";
import { getRoleConfig } from "./role-config";

// The approval pipeline lives here so the website dashboard and the Discord
// buttons run exactly the same steps.

export const CALLSIGN_RE = /^[A-Za-z0-9][A-Za-z0-9 \-]{1,23}$/;

type Answers = Record<string, string | number | undefined>;

export function answersOf(app: Pick<RecruitmentApplication, "answers">): Answers {
  return (app.answers ?? {}) as Answers;
}

export function applicationUrl(id: string) {
  return `${env.siteUrl}/recruitment/${id}`;
}

// --- The #recruitment-board embed ---------------------------------------- //

const COLORS = { PENDING: 0xd4a017, APPROVED: 0x4f7a3a, DENIED: 0x9b2c2c } as const;

export function boardMessage(
  app: RecruitmentApplication,
  decision?: { by: string; callsign?: string | null; note?: string | null },
) {
  const a = answersOf(app);
  const fields: { name: string; value: string; inline: boolean }[] = APPLICATION_QUESTIONS.filter(
    (q) => a[q.key] !== undefined && a[q.key] !== "",
  ).map((q) => ({
    name: q.label,
    value: String(a[q.key]).slice(0, 1000),
    inline: q.type !== "textarea",
  }));
  if (decision) {
    const what =
      app.status === "APPROVED"
        ? `✅ Approved by ${decision.by}${decision.callsign ? ` as **${decision.callsign}**` : ""}`
        : `❌ Denied by ${decision.by}`;
    fields.push({ name: "Decision", value: decision.note ? `${what}\n> ${decision.note}` : what, inline: false });
  }
  const components = [
    app.status === "PENDING"
      ? row(
          { type: 2, style: ButtonStyle.Success, label: "Approve", custom_id: `rec:approve:${app.id}` },
          { type: 2, style: ButtonStyle.Danger, label: "Deny", custom_id: `rec:deny:${app.id}` },
          linkButton("View Web Application", applicationUrl(app.id)),
        )
      : row(linkButton("View Web Application", applicationUrl(app.id))),
  ];
  return {
    embeds: [
      {
        title: `Application: ${app.discordUsername}`,
        url: applicationUrl(app.id),
        description: `<@${app.discordId}> applied to join the ${UNIT.name}.`,
        color: COLORS[app.status],
        fields,
        timestamp: app.createdAt.toISOString(),
        footer: { text: `${app.status} · ${app.id}` },
      },
    ],
    components,
    allowed_mentions: { parse: [] },
  };
}

export async function postToBoard(appId: string): Promise<string | null> {
  if (!env.boardChannelId || !env.botToken) return "Recruitment board isn't configured.";
  const app = await prisma.recruitmentApplication.findUniqueOrThrow({ where: { id: appId } });
  try {
    const msg = await sendMessage(env.boardChannelId, boardMessage(app));
    await prisma.recruitmentApplication.update({ where: { id: appId }, data: { boardMessageId: msg.id } });
    return null;
  } catch (e) {
    return explain(e);
  }
}

async function refreshBoard(app: RecruitmentApplication, decision: Parameters<typeof boardMessage>[1]) {
  if (!app.boardMessageId || !env.boardChannelId) return;
  await editMessage(env.boardChannelId, app.boardMessageId, boardMessage(app, decision));
}

// --- Decisions ----------------------------------------------------------- //

export type DecisionResult = { ok: true; warnings: string[] } | { ok: false; error: string };

export async function approveApplication(opts: {
  appId: string;
  reviewer: Pick<User, "id" | "discordUsername">;
  reviewerName?: string;
  callsign: string;
  rank?: string;
  note?: string | null;
}): Promise<DecisionResult> {
  const callsign = opts.callsign.trim();
  const rank = opts.rank && RANKS.some((r) => r.abbr === opts.rank) ? opts.rank : RECRUIT_RANK;
  if (!CALLSIGN_RE.test(callsign))
    return { ok: false, error: "Callsign must be 2–24 letters, numbers, spaces or hyphens." };

  const app = await prisma.recruitmentApplication.findUnique({ where: { id: opts.appId } });
  if (!app) return { ok: false, error: "Application not found." };
  if (app.status !== "PENDING") return { ok: false, error: `This application was already ${app.status.toLowerCase()}.` };

  const taken = await prisma.user.findFirst({
    where: { callsign: { equals: callsign, mode: "insensitive" }, NOT: { id: app.userId } },
  });
  if (taken) return { ok: false, error: `Callsign "${callsign}" is already in use.` };

  const by = opts.reviewerName ?? opts.reviewer.discordUsername;
  const updated = await prisma.$transaction(async (tx) => {
    // Guarded on PENDING so two recruiters clicking at once can't both win.
    const claimed = await tx.recruitmentApplication.updateMany({
      where: { id: app.id, status: "PENDING" },
      data: { status: "APPROVED", reviewedById: opts.reviewer.id, reviewNote: opts.note ?? null },
    });
    if (claimed.count === 0) return null;
    await tx.user.update({
      where: { id: app.userId },
      data: { callsign, rank, rankSince: new Date(), status: "ACTIVE", enlistedAt: new Date() },
    });
    await tx.serviceRecord.create({
      data: {
        userId: app.userId,
        type: "ENLISTMENT",
        title: `Enlisted as ${rankName(rank)}`,
        description: `Application approved by ${by}. Assigned callsign ${callsign}.`,
        issuedById: opts.reviewer.id,
      },
    });
    return tx.recruitmentApplication.findUniqueOrThrow({ where: { id: app.id } });
  });
  if (!updated) return { ok: false, error: "Someone else decided this application first." };

  // Discord side. Each step is independent: a failed nickname shouldn't stop
  // the role from being granted. Failures come back as warnings.
  const warnings: string[] = [];
  const reason = `Application approved by ${by}`;
  const step = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      warnings.push(`${label}: ${explain(e)}`);
    }
  };
  if (env.botToken) {
    await step("Nickname", () => setNickname(app.discordId, nickname(rank, callsign), reason));
    const roles = await getRoleConfig();
    if (roles.recruit) await step("Recruit role", () => addRole(app.discordId, roles.recruit, reason));
    if (roles.candidate) await step("Candidate role", () => removeRole(app.discordId, roles.candidate, reason));
    if (roles.ranks[rank]) await step("Rank role", () => addRole(app.discordId, roles.ranks[rank], reason));
    await step("Board post", () => refreshBoard(updated, { by, callsign, note: opts.note }));
    await step("Welcome DM", () =>
      dm(
        app.discordId,
        `Welcome to the ${UNIT.name}, **${callsign}**. Your application was approved — check the operations calendar at ${env.siteUrl}/ops and your dossier at ${env.siteUrl}/roster/${app.userId}.`,
      ),
    );
  } else {
    warnings.push("DISCORD_BOT_TOKEN isn't set, so no Discord roles or nickname were changed.");
  }
  return { ok: true, warnings };
}

export async function denyApplication(opts: {
  appId: string;
  reviewer: Pick<User, "id" | "discordUsername">;
  reviewerName?: string;
  note?: string | null;
}): Promise<DecisionResult> {
  const claimed = await prisma.recruitmentApplication.updateMany({
    where: { id: opts.appId, status: "PENDING" },
    data: { status: "DENIED", reviewedById: opts.reviewer.id, reviewNote: opts.note || null },
  });
  if (claimed.count === 0) return { ok: false, error: "This application isn't pending any more." };
  const app = await prisma.recruitmentApplication.findUniqueOrThrow({ where: { id: opts.appId } });
  const warnings: string[] = [];
  const by = opts.reviewerName ?? opts.reviewer.discordUsername;
  if (env.botToken) {
    try {
      await refreshBoard(app, { by, note: opts.note });
    } catch (e) {
      warnings.push(`Board post: ${explain(e)}`);
    }
  }
  return { ok: true, warnings };
}
