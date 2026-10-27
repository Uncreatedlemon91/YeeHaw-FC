import { prisma } from "./prisma";
import { announceSquad, announceWindow, endSeason, remindSeasonEnd, transitionSeason } from "./seasons";
import { nextStep, type JobStep } from "./season-rules";

// The daily season job, run by scripts/season-job.ts on a systemd timer. Each
// run asks nextStep() what is due and does it, until nothing is, so a missed
// day catches up in order. Every step is once-only (state change or marker),
// so running it twice, or by hand, is harmless.
//
//   open-window    a Draft season's window date has come: Draft -> Window, tell management
//   end-reminder   7 days before an Active season ends: remind management
//   end-season     the end date passed: contracts end, squad roles come off
//   start-season   a Window season's start date came and none is running: Window -> Active, announce the squad
//   announce       a started season whose announcement failed, retried for a few days

export type JobLogLine = { step: JobStep["kind"]; seasonId: string; name: string; warnings: string[] };

export async function runSeasonJob(now = new Date()): Promise<JobLogLine[]> {
  const log: JobLogLine[] = [];
  // Each step makes progress or is a no-op; the cap is only a backstop.
  for (let i = 0; i < 12; i++) {
    const seasons = await prisma.season.findMany();
    const step = nextStep(seasons, now);
    if (!step) break;
    const name = seasons.find((s) => s.id === step.seasonId)?.name ?? step.seasonId;
    const warnings: string[] = [];
    switch (step.kind) {
      case "end-season": {
        const r = await endSeason(step.seasonId);
        if (!r.ok) return [...log, { step: step.kind, seasonId: step.seasonId, name, warnings: [r.error] }];
        warnings.push(...r.warnings);
        break;
      }
      case "start-season": {
        const r = await transitionSeason(step.seasonId, "ACTIVE");
        if (!r.ok) return [...log, { step: step.kind, seasonId: step.seasonId, name, warnings: [r.error] }];
        warnings.push(...r.warnings);
        break;
      }
      case "open-window": {
        const r = await transitionSeason(step.seasonId, "WINDOW");
        if (!r.ok) return [...log, { step: step.kind, seasonId: step.seasonId, name, warnings: [r.error] }];
        warnings.push(...r.warnings, ...(await announceWindow(step.seasonId)));
        break;
      }
      case "end-reminder":
        // Mark first: a failed post is reported, not retried every day.
        await prisma.season.update({ where: { id: step.seasonId }, data: { endReminderAt: now } });
        warnings.push(...(await remindSeasonEnd(step.seasonId)));
        break;
      case "announce":
        warnings.push(...(await announceSquad(step.seasonId)));
        // Without a channel or on failure announcedAt stays null; mark the
        // attempt so this run ends. The grace window retries tomorrow.
        if (warnings.length) {
          log.push({ step: step.kind, seasonId: step.seasonId, name, warnings });
          return log;
        }
        break;
    }
    log.push({ step: step.kind, seasonId: step.seasonId, name, warnings });
  }
  return log;
}
