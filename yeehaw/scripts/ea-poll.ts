// The hourly EA poll: club record, matches, per-player lines, member totals,
// squad moves and the league table, into Postgres; then match linking,
// milestones and Player of the Month.
//   npm run ea:poll
// Runs from yeehaw-ea-poll.timer (deploy/). Safe to run by hand or twice:
// a match already stored is skipped and each announcement goes out once.

import { jobFailed, runEaJob } from "../src/lib/ea-job";
import { prisma } from "../src/lib/prisma";

async function main() {
  const log = await runEaJob();
  for (const l of log) {
    console.log(`[${l.step}] ${l.detail}`);
    for (const w of l.warnings) console.warn(`  ! ${w}`);
  }
  // A club poll that only warned (EA slow or down for one endpoint) is normal
  // for an unofficial API and isn't a failed run; a crashed step is.
  if (jobFailed(log)) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
