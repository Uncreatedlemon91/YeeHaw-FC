import { dm, explain } from "./discord";
import { availabilityDm, reminderDm } from "./event-messages";
import { eventsNeedingReminder, reminderKey, reminderTargets, REMINDER_AHEAD_MS } from "./event-rules";
import { awayOnDay } from "./availability";
import { isoWeek } from "./availability-rules";
import { announceDue, generateAll } from "./event-series";
import { claimNotification, eventUrl, toView } from "./events";
import { openDueVotes } from "./match-report";
import { env } from "./env";
import { prisma } from "./prisma";
import { weekdayOf } from "./recurrence";
import { liveSquad } from "./squad";
import { dayKey } from "./time";

// The hourly notify job (scripts/notify-job.ts, yeehaw-notify.timer): the
// things that happen because time passed rather than because somebody clicked.
//
//   series        keep every recurring series generated four weeks ahead
//   announce      post the RSVP announcement for series that announce N days ahead
//   reminders     DM contracted players who haven't answered an event starting within 24 hours
//   votes         open the Man of the Match vote two hours after a match kicks off, and post it
//   availability  Mondays: DM contracted players who have never set their usual nights
//
// Each message is recorded in Notification (once per event and player, or per
// player per ISO week), so running the job twice, or every hour, sends each
// message once. A DM that fails (closed inbox) is recorded too, so it isn't
// retried every hour. One step failing never stops the others.

export type JobLine = { step: string; detail: string; warnings: string[] };

/** Monday, from 10:00 club time: when the "set your usual nights" nudge goes out. */
export const NUDGE_FROM_HOUR = 10;

/** DM once. Returns true when a message went out. */
async function dmOnce(kind: string, key: string, discordId: string, content: string): Promise<boolean> {
  if (!(await claimNotification(kind, key))) return false;
  try {
    await dm(discordId, content);
    return true;
  } catch (e) {
    await prisma.notification.updateMany({ where: { kind, key }, data: { ok: false, detail: explain(e).slice(0, 300) } });
    return false;
  }
}

export async function sendReminders(now: Date): Promise<{ sent: number; events: number }> {
  const upcoming = await prisma.event.findMany({
    where: { signupsOpen: true, startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_AHEAD_MS) } },
    include: { signups: { select: { playerId: true } } },
    orderBy: { startsAt: "asc" },
  });
  const due = eventsNeedingReminder(upcoming, now);
  if (!due.length) return { sent: 0, events: 0 };
  const squad = await liveSquad();
  const contracted = squad.map((e) => ({ playerId: e.playerId, discordId: e.discordId }));
  let sent = 0;
  for (const event of due) {
    const away = await awayOnDay(contracted.map((c) => c.playerId), dayKey(event.startsAt));
    const targets = reminderTargets(contracted, new Set(event.signups.map((s) => s.playerId)), away);
    for (const t of targets) {
      if (await dmOnce("remind", reminderKey(event.id, t.playerId), t.discordId, reminderDm(toView(event), eventUrl(event.id)))) sent++;
    }
  }
  return { sent, events: due.length };
}

export async function sendAvailabilityNudges(now: Date): Promise<{ sent: number }> {
  const today = dayKey(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: env.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
  if (weekdayOf(today) !== 0 || hour < NUDGE_FROM_HOUR) return { sent: 0 };
  const squad = await liveSquad();
  const set = new Set((await prisma.availabilityPattern.findMany({ where: { playerId: { in: squad.map((e) => e.playerId) } }, select: { playerId: true } })).map((p) => p.playerId));
  const week = isoWeek(today);
  let sent = 0;
  for (const e of squad.filter((e) => !set.has(e.playerId))) {
    if (await dmOnce("availability", `${week}:${e.playerId}`, e.discordId, availabilityDm(`${env.siteUrl}/availability`))) sent++;
  }
  return { sent };
}

export async function runNotifyJob(now = new Date()): Promise<JobLine[]> {
  const steps: [string, () => Promise<{ detail: string; warnings?: string[] }>][] = [
    [
      "series",
      async () => {
        const r = await generateAll(now);
        const made = r.reduce((n, s) => n + s.created, 0);
        return { detail: `${made} new occurrence${made === 1 ? "" : "s"} across ${r.length} series` };
      },
    ],
    [
      "announce",
      async () => {
        const r = await announceDue(now);
        return { detail: `${r.filter((x) => !x.error).length} announced`, warnings: r.flatMap((x) => (x.error ? [`${x.title}: ${x.error}`] : [])) };
      },
    ],
    ["reminders", async () => {
      const r = await sendReminders(now);
      return { detail: `${r.sent} reminder${r.sent === 1 ? "" : "s"} for ${r.events} event${r.events === 1 ? "" : "s"}` };
    }],
    [
      "votes",
      async () => {
        const r = await openDueVotes(now);
        return { detail: `${r.opened} Man of the Match vote${r.opened === 1 ? "" : "s"} opened`, warnings: r.warnings };
      },
    ],
    ["availability", async () => ({ detail: `${(await sendAvailabilityNudges(now)).sent} nudge(s)` })],
  ];
  const log: JobLine[] = [];
  for (const [step, run] of steps) {
    try {
      const r = await run();
      log.push({ step, detail: r.detail, warnings: r.warnings ?? [] });
    } catch (e) {
      log.push({ step, detail: "failed", warnings: [e instanceof Error ? e.message : String(e)] });
    }
  }
  return log;
}
