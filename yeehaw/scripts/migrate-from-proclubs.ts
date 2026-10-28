// One-off: carry the old Python site's data (proclubs/data/site.db and
// history.db) into this site's Postgres database. Run once, at cutover.
//
//   npm run migrate:proclubs -- --site /opt/valorlink/proclubs/data/site.db \
//        --history /opt/valorlink/proclubs/data/history.db --old-env /opt/valorlink/proclubs/.env --dry-run
//
// Flags:
//   --site PATH, --history PATH   the old SQLite files (or SITE_DB_PATH / HISTORY_DB_PATH)
//   --old-env PATH                the old site's .env, to map its role and channel ids
//   --uploads DIR                 where article covers go (default UPLOAD_DIR)
//   --dry-run                     read, map and report counts; write nothing
//   --force                       run although the database already has data: players that already
//                                 exist are reused by Discord ID and settings already saved are kept;
//                                 any other collision aborts the run (it is one transaction, so
//                                 nothing is half-written)
//
// Needs Node 22.5+ (node:sqlite, no native build; Node prints an "experimental"
// notice). The old files are only ever opened read-only. What maps where, and
// what is dropped, is in src/lib/proclubs-import.ts and the README.

import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataUri, buildPlan, type Existing, type RawData, type Row } from "../src/lib/proclubs-import";
import { env } from "../src/lib/env";
import { sniffImage } from "../src/lib/news-images";
import { prisma } from "../src/lib/prisma";
import { fromInput } from "../src/lib/time";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

/** SQLite integers come back as BigInt so a Discord ID (past 2^53) keeps every digit; small ones become numbers, big ones strings. */
const plain = (v: unknown) => (typeof v === "bigint" ? (v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString()) : v);

function readAll(file: string): Record<string, Row[]> {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const out: Record<string, Row[]> = {};
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    for (const { name } of tables) {
      const stmt = db.prepare(`SELECT * FROM "${name}"`);
      stmt.setReadBigInts(true);
      out[name] = (stmt.all() as Row[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)])));
    }
    return out;
  } finally {
    db.close();
  }
}

/** KEY=VALUE lines, quotes stripped; enough for the old .env. */
async function readEnvFile(file: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

const list = (name: string) => (process.env[name] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

async function existingData(): Promise<{ counts: Record<string, number>; existing: Existing }> {
  const counts = {
    players: await prisma.player.count(),
    seasons: await prisma.season.count(),
    contracts: await prisma.contract.count(),
    events: await prisma.event.count(),
    articles: await prisma.article.count(),
    "EA matches": await prisma.eaMatch.count(),
    "roster moves": await prisma.rosterMove.count(),
    "service entries": await prisma.serviceEntry.count(),
  };
  const [players, articles, settings] = await Promise.all([
    prisma.player.findMany({ select: { id: true, discordId: true, slug: true, gamertag: true } }),
    prisma.article.findMany({ select: { slug: true } }),
    prisma.setting.findMany({ select: { key: true } }),
  ]);
  return {
    counts,
    existing: {
      players: new Map(players.map((p) => [p.discordId, p.id])),
      slugs: new Set(players.map((p) => p.slug)),
      gamertags: new Set(players.flatMap((p) => (p.gamertag ? [p.gamertag.toLowerCase()] : []))),
      articleSlugs: new Set(articles.map((a) => a.slug)),
      settingKeys: new Set(settings.map((s) => s.key)),
    },
  };
}

async function main() {
  const siteFile = opt("site") ?? process.env.SITE_DB_PATH;
  const historyFile = opt("history") ?? process.env.HISTORY_DB_PATH;
  if (!siteFile || !historyFile) throw new Error("Give --site and --history (the old site.db and history.db), e.g. --site /opt/valorlink/proclubs/data/site.db --history /opt/valorlink/proclubs/data/history.db");
  const dry = flag("dry-run");

  const raw: RawData = { site: readAll(siteFile), history: readAll(historyFile) };
  const oldEnv = opt("old-env") ? await readEnvFile(opt("old-env")!) : {};
  const startsAt = fromInput("2026-10-20T00:00");
  if (!startsAt) throw new Error("CLUB_TIMEZONE is not a valid zone.");

  // Is the database empty? A dry run reports it but also works without a database.
  let existing: Existing | undefined;
  try {
    const found = await existingData();
    const used = Object.entries(found.counts).filter(([, n]) => n > 0);
    if (used.length) {
      const what = used.map(([k, n]) => `${n} ${k}`).join(", ");
      if (!flag("force") && !dry) throw new Error(`The database already has data (${what}). Migrate into an empty database, or pass --force to reuse the existing players and keep saved settings.`);
      console.warn(`! The database already has data (${what}).${flag("force") ? " --force: existing players are reused." : " A real run would refuse without --force."}`);
    }
    existing = found.existing;
  } catch (e) {
    if (!dry) throw e;
    console.warn(`! Database not reachable (${e instanceof Error ? e.message.split("\n").pop() : e}); dry run continues without the emptiness check.`);
  }

  const plan = buildPlan(
    raw,
    {
      articleAuthor: env.articleAuthor,
      oldEnv,
      permRoleIds: { MEMBER: list("ROLE_IDS_MEMBER"), STAFF: list("ROLE_IDS_STAFF"), MANAGEMENT: list("ROLE_IDS_MANAGEMENT") },
      season: { name: "Season 2", startsAt, endsAt: new Date(startsAt.getTime() + 12 * 7 * 86_400_000) },
      now: new Date(),
    },
    existing,
  );

  console.log(dry ? "Dry run: nothing will be written.\n" : "Importing...\n");
  for (const [model, rows] of plan.tables) console.log(`  ${model.padEnd(20)} ${rows.length}`);
  console.log(`  ${"article covers".padEnd(20)} ${plan.covers.length} file(s)`);
  if (Object.keys(plan.dropped).length) {
    console.log("\nLeft behind on purpose:");
    for (const [k, n] of Object.entries(plan.dropped)) console.log(`  ${String(n).padStart(5)}  ${k}`);
  }
  if (plan.warnings.length) {
    console.log("\nWarnings:");
    for (const w of plan.warnings) console.log(`  ! ${w}`);
  }
  if (dry) return;

  // Cover files first (random names, harmless if the insert then fails and they are removed).
  const dir = path.resolve(opt("uploads") ?? env.uploadDir, "articles");
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  try {
    for (const c of plan.covers) {
      const img = dataUri(c.dataUri);
      if (!img || sniffImage(img.bytes) === null) throw new Error(`Cover ${c.name} is not a readable image.`);
      const file = path.join(dir, c.name);
      await writeFile(file, img.bytes, { flag: "wx" });
      written.push(file);
    }
    await prisma.$transaction(
      async (tx) => {
        for (const [model, rows] of plan.tables) {
          const delegate = (tx as unknown as Record<string, { createMany: (a: { data: Row[]; skipDuplicates?: boolean }) => Promise<{ count: number }> }>)[model];
          const r = await delegate.createMany({ data: rows, skipDuplicates: model === "notification" });
          if (r.count !== rows.length) console.warn(`  ! ${model}: ${r.count} of ${rows.length} rows written`);
        }
      },
      { timeout: 300_000, maxWait: 10_000 },
    );
  } catch (e) {
    await Promise.all(written.map((f) => unlink(f).catch(() => undefined)));
    throw e;
  }

  const [players, contracts, events, articles, matches] = await Promise.all([prisma.player.count(), prisma.contract.count(), prisma.event.count(), prisma.article.count(), prisma.eaMatch.count()]);
  console.log(`\nDone. Database now holds ${players} players, ${contracts} contracts, ${events} events, ${articles} articles, ${matches} EA matches.`);
  console.log("Next: assign shirt numbers on Admin > Seasons & contracts, check Admin > Discord roles & channels, then `systemctl start yeehaw-ea-poll`.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
