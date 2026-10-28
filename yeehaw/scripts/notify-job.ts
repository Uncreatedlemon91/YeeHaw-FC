// The hourly notify job: generates recurring events ahead, announces the ones
// that announce themselves, DMs reminders for events within 24 hours and, on
// Mondays, nudges players who never set their usual nights.
//   npm run notify:job
// Runs from yeehaw-notify.timer (deploy/). Safe to run by hand or twice: each
// message is recorded and goes out once.

import { runNotifyJob } from "../src/lib/notify-job";
import { prisma } from "../src/lib/prisma";

async function main() {
  const log = await runNotifyJob();
  for (const l of log) {
    console.log(`${l.step}: ${l.detail}`);
    for (const w of l.warnings) console.warn(`  ! ${w}`);
  }
  if (log.some((l) => l.detail === "failed")) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
