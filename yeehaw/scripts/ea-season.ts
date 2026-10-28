// Switch to a new game title's EA club and erase the old one's stats
// (port of proclubs/season.py). EA issues a new club id every title.
//
//   npm run ea:season -- find                       search EA for EA_CLUB_NAME
//   npm run ea:season -- switch                     use the one exact match found
//   npm run ea:season -- switch --club-id 1234567   or name the club outright
//   npm run ea:season -- reset                      erase the stats only
//
// Flags: --name, --platform, --yes (no prompt), --no-archive (delete outright).
// Run on the droplet in /opt/yeehaw/yeehaw as the yeehaw user. Everything that
// is erased is archived to the backups directory first, as JSON.

import { readFile, rename, writeFile, chmod, stat } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { PLATFORMS } from "../src/lib/ea-client";
import { archiveEaData, eraseEaData, findClubs, resolveClub, SEARCH_PLATFORMS, SeasonError, setEnvValues } from "../src/lib/ea-season";
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function confirm(q: string) {
  if (flag("yes")) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${q} [y/N] `)).trim().toLowerCase();
  rl.close();
  if (a !== "y" && a !== "yes") throw new SeasonError("aborted: nothing was changed.");
}

async function erase() {
  if (flag("no-archive")) console.log("  old stats deleted, not archived.");
  else {
    const file = await archiveEaData(env.eaClubId);
    console.log(`  old stats archived to ${file}\n  (delete it for good with: rm ${file})`);
  }
  await eraseEaData();
}

function nextSteps() {
  console.log("\nNow restart the site (it reads EA_CLUB_ID at startup) and take a first");
  console.log("snapshot rather than waiting for the hourly poll:");
  console.log("  sudo systemctl restart yeehaw");
  console.log("  sudo systemctl start yeehaw-ea-poll");
}

async function setEnv(values: Record<string, string>) {
  const file = path.resolve(".env");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new SeasonError(`${file} doesn't exist: copy .env.example to it first.`);
  }
  const mode = (await stat(file)).mode & 0o777;
  // Write beside the original and rename over it, so a crash can't leave half a secrets file.
  const tmp = `${file}.tmp`;
  await writeFile(tmp, setEnvValues(text, values), { mode });
  await chmod(tmp, mode);
  await rename(tmp, file);
}

async function main() {
  const name = opt("name") ?? env.eaClubName;
  const platform = opt("platform");
  if (platform && !(platform in PLATFORMS)) throw new SeasonError(`unknown platform '${platform}' (${Object.keys(PLATFORMS).join(", ")})`);

  if (cmd === "find") {
    const clubs = await findClubs(name, platform ? [platform] : SEARCH_PLATFORMS);
    if (!clubs.length) {
      console.log(`EA returned no clubs matching '${name}'. A club created in the last few days may not be in EA's search yet.`);
      console.log("Its id is in the URL of the club's page on EA's Pro Clubs site. Then: npm run ea:season -- switch --club-id <ID>");
      return;
    }
    console.log(`Clubs matching '${name}':`);
    for (const c of clubs) console.log(`  ${c.clubId.padStart(10)}  ${c.platform.padEnd(12)}  ${c.name}${c.exact ? "  <- exact name" : ""}${c.clubId === env.eaClubId ? "  (current EA_CLUB_ID)" : ""}`);
    const exact = clubs.filter((c) => c.exact);
    if (exact.length === 1) console.log("\nOne exact match. Switch to it with: npm run ea:season -- switch");
    else if (exact.length > 1) console.log(`\n${exact.length} exact matches: pick yours with: npm run ea:season -- switch --club-id <ID>`);
  } else if (cmd === "switch") {
    const club = await resolveClub(name, opt("club-id"), platform, env.eaPlatform);
    if (club.clubId === env.eaClubId && club.platform === env.eaPlatform) {
      console.log(`EA_CLUB_ID is already ${club.clubId} (${club.name}). Nothing to switch.\nTo erase its stats anyway: npm run ea:season -- reset`);
      return;
    }
    console.log(`Switching to: ${club.name}  (club ${club.clubId}, ${club.platform})`);
    if (env.eaClubId) console.log(`Replacing:    club ${env.eaClubId} (${env.eaPlatform})`);
    console.log("This ERASES all accumulated EA stats: snapshots, matches, player lines and the");
    console.log("league table. Seasons, contracts, events, articles, honors and gamertags are kept.");
    await confirm("Proceed?");
    await erase();
    await setEnv({ EA_CLUB_ID: club.clubId, EA_PLATFORM: club.platform });
    console.log(`\nDone. EA_CLUB_ID=${club.clubId}, EA_PLATFORM=${club.platform}`);
    nextSteps();
  } else if (cmd === "reset") {
    console.log("This ERASES all accumulated EA stats. EA_CLUB_ID and the club's own records are unchanged.");
    await confirm("Proceed?");
    await erase();
    console.log("\nDone.");
    nextSteps();
  } else {
    console.log("usage: npm run ea:season -- find | switch [--club-id N] | reset   (--name, --platform, --yes, --no-archive)");
    process.exitCode = 2;
  }
}

main()
  .catch((e) => {
    console.error(`ea-season: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
