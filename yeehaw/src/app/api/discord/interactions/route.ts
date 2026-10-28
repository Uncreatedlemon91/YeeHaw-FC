import { NextResponse } from "next/server";
import { contractButton } from "@/lib/contract-interactions";
import { rsvpComponent } from "@/lib/event-interactions";
import { linkButton, row } from "@/lib/discord";
import { verifySignature } from "@/lib/discord-verify";
import { R, reply, T, type Interaction } from "@/lib/interactions";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { discordTime } from "@/lib/time";

// Discord's interactions webhook. Set it in the Developer Portal as
//   https://yeehaw-fc.club/api/discord/interactions
// Every slash command and button press arrives here as a signed POST, so
// they keep working even if the gateway process (scripts/gateway.mjs) is down.
//
// Button custom_ids are "<namespace>:<action>:<id...>". Later phases add a
// namespace each to component() and modalSubmit(): "ct" (contract offer
// Accept / Decline, built), "rsvp" (event sign-up buttons and position
// picker, built), "motm" (the post-match vote).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  if (!verifySignature(body, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"), env.publicKey)) {
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
    case "fixtures": {
      const events = await prisma.event.findMany({
        where: { startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 5,
      });
      if (!events.length) return reply("Nothing scheduled. Check back soon.");
      const lines = events.map(
        (e) => `**${e.title}** — ${discordTime(e.startsAt)}, ${discordTime(e.startsAt, "R")}\n${env.siteUrl}/fixtures/${e.id}`,
      );
      return reply(lines.join("\n\n"), { components: [row(linkButton("All fixtures", `${env.siteUrl}/fixtures`))] });
    }
    case "squad":
      return reply("The first-choice XI, the bench and the rest of the squad:", {
        components: [row(linkButton("Squad", `${env.siteUrl}/squad`))],
      });
    default:
      return reply("Unknown command.");
  }
}

// --- Buttons and forms --------------------------------------------------- //

async function component(i: Interaction) {
  const [ns] = (i.data?.custom_id ?? "").split(":");
  switch (ns) {
    case "ct":
      return contractButton(i);
    case "rsvp":
      return rsvpComponent(i);
    default:
      return reply("Unknown button.");
  }
}

async function modalSubmit(i: Interaction) {
  const [ns] = (i.data?.custom_id ?? "").split(":");
  switch (ns) {
    default:
      return reply("Unknown form.");
  }
}
