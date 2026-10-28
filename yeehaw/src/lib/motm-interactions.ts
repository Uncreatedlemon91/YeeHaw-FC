import { castVote, setSelfRating } from "./match-report";
import { hasPerm } from "./permissions";
import { ensurePlayer } from "./players";
import { permsOf, reply, type Interaction } from "./interactions";
import { RATING_WORDS } from "./recognition-rules";

/**
 * "motm:vote:<eventId>" (the Man of the Match picker; the value is the
 * nominee's player id) and "motm:rate:<eventId>" (rate your own game, 1 to
 * 10). Port of handle_picker in matchweek_routes.py. Only club members can
 * answer, and the same rules as the site apply (castVote / setSelfRating:
 * the vote is open, you were in the squad, not for yourself). Always answered
 * privately, so the post itself never changes.
 */
export async function motmComponent(i: Interaction) {
  const [, action, eventId] = (i.data?.custom_id ?? "").split(":");
  const user = i.member?.user ?? i.user;
  const value = i.data?.values?.[0];
  if (!eventId || !user || (action !== "vote" && action !== "rate")) return reply("That control isn't recognised.");
  if (!value) return reply("Pick an option from the list.");
  if (!hasPerm(await permsOf(i), "MEMBER")) return reply("Only club members can vote. Join the club's Discord server first.");

  const player = await ensurePlayer({ discordId: user.id, username: user.username, displayName: i.member?.nick || user.global_name || user.username, avatar: user.avatar });
  if (action === "vote") {
    const r = await castVote(eventId, player.id, value);
    return reply(r.ok ? `Vote counted: **${r.nominee}**. You can change it until voting closes.` : r.error);
  }
  const r = await setSelfRating(eventId, player.id, value);
  return reply(r.ok && r.rating ? `Rated your game **${r.rating}/10** (${RATING_WORDS[r.rating]}). The coach's rating shows on the match report.` : r.ok ? "Rating cleared." : r.error);
}
