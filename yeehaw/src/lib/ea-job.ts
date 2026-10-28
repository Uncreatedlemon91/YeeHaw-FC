import { linkMatchesToEvents, relinkPlayers, runClubPolls, type PollLine } from "./ea-poll";
import { env } from "./env";
import { announceMilestones, evaluateMilestones, runPotm } from "./recognition";

// The hourly EA job (scripts/ea-poll.ts, yeehaw-ea-poll.timer): poll EA into
// Postgres, then do what the new data makes possible. Each step reports on
// its own and a failure in one never stops the others.
//
//   clubs         our club's snapshot, matches, member totals and squad moves, then
//                 every club in the league roster (ea-poll.ts)
//   players       match lines stored before a gamertag was linked get their Player
//   events        matches played inside an event's window are linked to it (the match report)
//   milestones    award and announce what players have reached (recognition.ts)
//   potm          once a month is over, award and announce Player of the Month

export type JobLine = PollLine;

export async function runEaJob(now = new Date()): Promise<JobLine[]> {
  const out: JobLine[] = [];
  const step = async (name: string, run: () => Promise<{ detail: string; warnings?: string[] }>) => {
    try {
      const r = await run();
      out.push({ step: name, detail: r.detail, warnings: r.warnings ?? [] });
    } catch (e) {
      out.push({ step: name, detail: "failed", warnings: [e instanceof Error ? e.message : String(e)] });
    }
  };

  try {
    out.push(...(await runClubPolls()));
  } catch (e) {
    out.push({ step: "clubs", detail: "failed", warnings: [e instanceof Error ? e.message : String(e)] });
  }
  await step("players", async () => ({ detail: `${await relinkPlayers()} line(s) linked to a player` }));
  await step("events", async () => ({ detail: env.eaClubId ? `${await linkMatchesToEvents(env.eaClubId)} match(es) linked to an event` : "no club set" }));
  await step("milestones", async () => {
    const fresh = await evaluateMilestones(now);
    const a = await announceMilestones();
    return { detail: `${fresh.length} new, ${a.posted} announced`, warnings: a.warning ? [a.warning] : [] };
  });
  await step("potm", async () => {
    const r = await runPotm(now);
    return { detail: r.awarded ? `awarded ${r.awarded}; ${r.posted} announced` : `${r.posted} announced`, warnings: r.warning ? [r.warning] : [] };
  });
  return out;
}

/** A failed club poll or step is worth a non-zero exit so systemd and the journal show it. */
export const jobFailed = (log: readonly JobLine[]) => log.some((l) => l.detail === "failed");
