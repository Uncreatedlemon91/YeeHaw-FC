// The AI roundup: have Claude write up the last few days and publish it.
//   npm run article:job              publish if one is due
//   npm run article:job -- --dry-run write one and print it, publish nothing
// Runs from yeehaw-article.timer (deploy/), daily at 09:15 US Eastern; the job
// skips the days between roundups (ROUNDUP_DAYS, default 2). Exits non-zero
// when Claude can't be reached or returns something unusable, so systemd's
// Restart=on-failure retries later (e.g. after a subscription usage limit
// resets). A period with nothing to report is a clean skip, not a failure.

import { runArticleJob } from "../src/lib/article-job";
import { prisma } from "../src/lib/prisma";

async function main() {
  const r = await runArticleJob({ dryRun: process.argv.includes("--dry-run") });
  console.log(r.message);
  process.exitCode = r.code;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
