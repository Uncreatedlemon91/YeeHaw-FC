import type { SignupChange } from "./event-rules";
import { announcementFor, respond } from "./events";
import { hasPerm } from "./permissions";
import { ensurePlayer } from "./players";
import { permsOf, reply, updateMessage, type Interaction } from "./interactions";

/**
 * "rsvp:going|maybe|out:<eventId>" (the buttons) and "rsvp:slot:<eventId>"
 * (the position picker; the chosen slot arrives as the select's value). Only
 * club members can answer. Pressing is the same act as answering on the site
 * (events.respond), so the rules are the same; the press rewrites the
 * announcement in the same response so the roster updates at once. A refusal
 * (somebody took that position a second earlier) is private to the presser
 * and leaves the post as it was.
 */
export async function rsvpComponent(i: Interaction) {
  const [, action, eventId] = (i.data?.custom_id ?? "").split(":");
  const user = i.member?.user ?? i.user;
  if (!eventId || !user) return reply("Unknown button.");

  let change: SignupChange;
  if (action === "slot") {
    const slotKey = i.data?.values?.[0];
    if (!slotKey) return reply("Pick a position from the list.");
    change = { kind: "claim", slotKey };
  } else if (action === "going" || action === "maybe" || action === "out") {
    change = { kind: "status", status: action.toUpperCase() as "GOING" | "MAYBE" | "OUT" };
  } else return reply("Unknown button.");

  if (!hasPerm(await permsOf(i), "MEMBER")) return reply("Only club members can sign up. Join the club's Discord server to answer.");
  const player = await ensurePlayer({
    discordId: user.id,
    username: user.username,
    displayName: i.member?.nick || user.global_name || user.username,
    avatar: user.avatar,
  });
  const r = await respond(eventId, player, change, "DISCORD", { refresh: false });
  if (!r.ok) return reply(r.error);
  const payload = await announcementFor(eventId);
  return payload ? updateMessage(payload) : reply("That event no longer exists.");
}
