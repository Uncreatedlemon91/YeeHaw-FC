// The daily season job: opens a re-signing window, reminds management a week
// before a season ends, ends the season's contracts, announces the new squad.
//   npm run season:job
// Runs from yeehaw-season-job.timer (deploy/). Safe to run by hand or twice.

import { runSeasonJob } from "../src/lib/season-job";
import { prisma } from "../src/lib/prisma";

async function main() {
  const log = await runSeasonJob();
  if (!log.length) console.log("Nothing due.");
  for (const l of log) {
    console.log(`${l.step}: ${l.name}`);
    for (const w of l.warnings) console.warn(`  ! ${w}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
