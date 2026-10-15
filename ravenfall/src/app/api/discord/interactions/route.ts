import { createPublicKey, verify } from "node:crypto";
import { after, NextResponse } from "next/server";
import { UNIT } from "@/config/unit";
import { editOriginal, explain, linkButton, row } from "@/lib/discord";
import { env } from "@/lib/env";
import { hasPerm, permsFromRoles } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { decideRequest, REQUEST_LABEL } from "@/lib/personnel";
import { getRoleConfig } from "@/lib/role-config";
import { answersOf, approveApplication, denyApplication } from "@/lib/recruitment";
import { discordTime } from "@/lib/time";

// Discord's interactions webhook. Set it in the Developer Portal as
//   https://ravenfallpmc.com/api/discord/interactions
// Every slash command and button press arrives here as a signed POST, so
// they keep working even if the gateway process (scripts/gateway.mjs) is down.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EPHEMERAL = 64;
const T = { PING: 1, COMMAND: 2, COMPONENT: 3, MODAL_SUBMIT: 5 } as const;
const R = { PONG: 1, MESSAGE: 4, DEFERRED_MESSAGE: 5, MODAL: 9 } as const;

type Interaction = {
  type: number;
  token: string;
  guild_id?: string;
  data?: {
    name?: string;
    custom_id?: string;
    components?: { components: { custom_id: string; value: string }[] }[];
  };
  member?: { roles: string[]; nick?: string | null; user: { id: string; username: string; global_name?: string | null; avatar?: string | null } };
};

// Ed25519 over timestamp + body, as Discord requires. Node's crypto wants
// the raw 32-byte key wrapped in an SPKI header.
function verifySignature(body: string, signature: string | null, timestamp: string | null): boolean {
  if (!signature || !timestamp || !env.publicKey) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(env.publicKey, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

const reply = (content: string, extra: object = {}) =>
  NextResponse.json({ type: R.MESSAGE, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });

export async function POST(req: Request) {
  const body = await req.text();
  if (!verifySignature(body, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"))) {
    return new NextResponse("invalid request signature", { status: 401 });
  }
  const i = JSON.parse(body) as Interaction;

  if (i.type === T.PING) return NextResponse.json({ type: R.PONG });
  if (i.type === T.COMMAND) return command(i);
  if (i.type === T.COMPONENT) return component(i);
  if (i.type === T.MODAL_SUBMIT) return modalSubmit(i);
  return reply("Unsupported interaction.");
}

// --- Slash commands ------------------------------------------------------ //

async function command(i: Interaction) {
  switch (i.data?.name) {
    case "enlist":
      return reply(
        `Ready to join **${UNIT.name}**? Sign in with Discord and fill out the application — recruiters are notified as soon as you submit.`,
        { components: [row(linkButton("Enlist Now", `${env.siteUrl}/apply`))] },
      );
    case "ops": {
      const ops = await prisma.event.findMany({
        where: { startTime: { gte: new Date() } },
        orderBy: { startTime: "asc" },
        take: 5,
      });
      if (!ops.length) return reply("No operations scheduled. Check back soon.");
      const lines = ops.map(
        (o) =>
          `**${o.title}** (${o.type}${o.mandatory ? ", mandatory" : ""}) — ${discordTime(o.startTime)}, ${discordTime(o.startTime, "R")}\n${env.siteUrl}/ops/${o.id}`,
      );
      return reply(lines.join("\n\n"), { components: [row(linkButton("Operations Calendar", `${env.siteUrl}/ops`))] });
    }
    default:
      return reply("Unknown command.");
  }
}

// --- Approve / Deny buttons ---------------------------------------------- //

async function isRecruiter(i: Interaction) {
  return hasPerm(permsFromRoles(i.member?.roles ?? [], i.member?.user.id, (await getRoleConfig()).perms), "RECRUITER");
}

const textInput = (custom_id: string, label: string, o: { value?: string; long?: boolean; required?: boolean; max?: number; min?: number }) =>
  row({
    type: 4,
    custom_id,
    label,
    style: o.long ? 2 : 1,
    required: o.required ?? true,
    max_length: o.max,
    min_length: o.min,
    ...(o.value ? { value: o.value } : {}),
  });

async function component(i: Interaction) {
  const [ns, action, appId] = (i.data?.custom_id ?? "").split(":");
  if (ns === "per" && appId) return personnelButton(i, action, appId);
  if (ns !== "rec" || !appId) return reply("Unknown button.");
  if (!(await isRecruiter(i))) return reply("Only recruiters can decide applications.");

  const app = await prisma.recruitmentApplication.findUnique({ where: { id: appId } });
  if (!app) return reply("That application no longer exists.");
  if (app.status !== "PENDING") return reply(`This application was already ${app.status.toLowerCase()}.`);

  if (action === "approve") {
    const suggested = String(answersOf(app).callsign ?? "").slice(0, 24);
    return NextResponse.json({
      type: R.MODAL,
      data: {
        custom_id: `rec:approve-modal:${app.id}`,
        title: `Approve ${app.discordUsername}`.slice(0, 45),
        components: [
          textInput("callsign", "Callsign", { value: suggested, min: 2, max: 24 }),
          textInput("note", "Note (optional, shown on the board)", { long: true, required: false, max: 500 }),
        ],
      },
    });
  }
  if (action === "deny") {
    return NextResponse.json({
      type: R.MODAL,
      data: {
        custom_id: `rec:deny-modal:${app.id}`,
        title: `Deny ${app.discordUsername}`.slice(0, 45),
        components: [textInput("note", "Reason (recruiters only)", { long: true, required: false, max: 500 })],
      },
    });
  }
  return reply("Unknown button.");
}

async function modalSubmit(i: Interaction) {
  const [ns, action, appId] = (i.data?.custom_id ?? "").split(":");
  if (ns === "per" && action === "deny-modal" && appId) {
    const note = (i.data?.components ?? []).flatMap((r) => r.components).find((c) => c.custom_id === "note")?.value ?? "";
    return personnelDecision(i, appId, false, note.trim() || null);
  }
  if (ns !== "rec" || !appId) return reply("Unknown form.");
  if (!(await isRecruiter(i))) return reply("Only recruiters can decide applications.");
  const values = Object.fromEntries(
    (i.data?.components ?? []).flatMap((r) => r.components.map((c) => [c.custom_id, c.value.trim()])),
  );
  const m = i.member!;

  // Approval touches the database and several Discord endpoints, which can
  // outrun Discord's 3-second deadline. Acknowledge now, finish after.
  after(async () => {
    let content: string;
    try {
      const reviewer = await prisma.user.upsert({
        where: { discordId: m.user.id },
        create: { discordId: m.user.id, discordUsername: m.user.username, avatar: m.user.avatar ?? null },
        update: {},
      });
      const reviewerName = m.nick || m.user.global_name || m.user.username;
      const result =
        action === "approve-modal"
          ? await approveApplication({ appId, reviewer, reviewerName, callsign: values.callsign ?? "", note: values.note || null })
          : await denyApplication({ appId, reviewer, reviewerName, note: values.note || null });
      if (!result.ok) content = `⚠️ ${result.error}`;
      else
        content =
          (action === "approve-modal" ? "✅ Approved." : "❌ Denied.") +
          (result.warnings.length ? `\n\nSome Discord steps failed:\n${result.warnings.map((w) => `• ${w}`).join("\n")}` : "");
    } catch (e) {
      content = `⚠️ Something went wrong: ${explain(e)}`;
    }
    await editOriginal(i.token, { content, allowed_mentions: { parse: [] } }).catch(() => {});
  });

  return NextResponse.json({ type: R.DEFERRED_MESSAGE, data: { flags: EPHEMERAL } });
}

// --- Personnel board (S1) ------------------------------------------------ //
// Who may decide is worked out in decideRequest from the clicker's Discord
// roles and their billet on the site, exactly as on the S1 Desk.

async function personnelButton(i: Interaction, action: string, requestId: string) {
  const req = await prisma.personnelRequest.findUnique({ where: { id: requestId }, include: { user: true } });
  if (!req) return reply("That request no longer exists.");
  if (req.status !== "PENDING") return reply(`This request was already ${req.status.toLowerCase()}.`);
  if (action === "approve") return personnelDecision(i, requestId, true, null);
  if (action === "deny") {
    return NextResponse.json({
      type: R.MODAL,
      data: {
        custom_id: `per:deny-modal:${requestId}`,
        title: `Deny ${REQUEST_LABEL[req.type].toLowerCase()}`.slice(0, 45),
        components: [textInput("note", "Reason (sent to the member)", { long: true, required: false, max: 500 })],
      },
    });
  }
  return reply("Unknown button.");
}

function personnelDecision(i: Interaction, requestId: string, approve: boolean, note: string | null) {
  const m = i.member;
  if (!m) return reply("Use this in the server.");
  after(async () => {
    let content: string;
    try {
      const reviewer = await prisma.user.upsert({
        where: { discordId: m.user.id },
        create: { discordId: m.user.id, discordUsername: m.user.username, avatar: m.user.avatar ?? null },
        update: {},
      });
      const result = await decideRequest({
        requestId,
        approve,
        reviewer: { id: reviewer.id, perms: permsFromRoles(m.roles, m.user.id, (await getRoleConfig()).perms) },
        reviewerName: m.nick || m.user.global_name || m.user.username,
        note,
      });
      content = !result.ok
        ? `⚠️ ${result.error}`
        : (approve ? "✅ Approved." : "❌ Denied.") +
          (result.warnings.length ? `\n\nSome Discord steps failed:\n${result.warnings.map((w) => `• ${w}`).join("\n")}` : "");
    } catch (e) {
      content = `⚠️ Something went wrong: ${explain(e)}`;
    }
    await editOriginal(i.token, { content, allowed_mentions: { parse: [] } }).catch(() => {});
  });
  return NextResponse.json({ type: R.DEFERRED_MESSAGE, data: { flags: EPHEMERAL } });
}
