import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { divisionLabel } from "./ea-rules";

// Thin client for EA's unofficial Pro Clubs API (proclubs.ea.com/api/fc).
// Port of proclubs/ea_client.py. The API is undocumented and has no stability
// guarantees: endpoints, fields and platform codes have changed across titles.
//
// EA's edge (Akamai Bot Manager) fingerprints the TLS handshake and 403s
// plain scripted traffic that a browser gets through. The Python client used
// curl_cffi, which impersonates Chrome's handshake. Node's own fetch can't, so
// there are two ways in:
//   default       fetch() with a browser's headers (may be refused with 403)
//   EA_CURL_BIN   a curl-impersonate binary (e.g. curl_chrome124) used instead,
//                 which carries Chrome's handshake. Set it if the poll logs 403.
// Calls are spaced out and retried politely on 429 / 5xx.

const execFileP = promisify(execFile);

export const BASE_URL = "https://proclubs.ea.com/api/fc/";

/** "common-gen5" is PC + current-gen consoles (crossplay), "common-gen4" last-gen, "nx" legacy. */
export const PLATFORMS: Record<string, string> = {
  "common-gen5": "PC / PS5 / Xbox Series",
  "common-gen4": "PS4 / Xbox One",
  nx: "Legacy",
};

const TIMEOUT_MS = 15_000;
/** Minimum gap between two requests, so an hourly poll of ~25 clubs never bursts. */
const MIN_GAP_MS = 400;
const MAX_ATTEMPTS = 3;

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.ea.com",
  Referer: "https://www.ea.com/",
};

export class EaError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

let last = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pace() {
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
}

type Raw = { status: number; text: string; retryAfter?: number };

async function viaFetch(url: string): Promise<Raw> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const ra = Number(res.headers.get("retry-after"));
  return { status: res.status, text: await res.text(), retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined };
}

async function viaCurl(bin: string, url: string): Promise<Raw> {
  const args = ["-sS", "--max-time", String(TIMEOUT_MS / 1000), "-w", "\n%{http_code}"];
  for (const [k, v] of Object.entries(HEADERS)) if (k !== "User-Agent") args.push("-H", `${k}: ${v}`);
  args.push(url);
  const { stdout } = await execFileP(bin, args, { maxBuffer: 16 * 1024 * 1024 });
  const i = stdout.lastIndexOf("\n");
  return { status: Number(stdout.slice(i + 1)) || 0, text: stdout.slice(0, Math.max(i, 0)) };
}

/** EA read. Null for the empty 200 EA sends for "no data" (a club with no matches, a bad id). */
export async function eaGet(path: string, params: Record<string, string | number>): Promise<unknown> {
  const platform = String(params.platform ?? "");
  if (!platform) throw new EaError("platform is required", 400);
  if (!(platform in PLATFORMS)) throw new EaError(`unknown platform '${platform}'`, 400);
  const url = BASE_URL + path + "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const curl = process.env.EA_CURL_BIN;

  let failure = new EaError("could not reach EA's API");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await pace();
    let raw: Raw;
    try {
      raw = curl ? await viaCurl(curl, url) : await viaFetch(url);
    } catch (e) {
      failure = new EaError(`could not reach EA's API: ${e instanceof Error ? e.message : e}`);
      if (attempt < MAX_ATTEMPTS) await sleep(2000 * attempt);
      continue;
    }
    if (raw.status === 404) throw new EaError("not found: check the club ID / name and platform", 404);
    if (raw.status === 429 || raw.status >= 500) {
      failure = new EaError(`EA API returned HTTP ${raw.status}`, raw.status);
      if (attempt < MAX_ATTEMPTS) await sleep(Math.min((raw.retryAfter ?? 2 * attempt) * 1000, 30_000));
      continue;
    }
    if (raw.status < 200 || raw.status >= 300) {
      const hint = raw.status === 403 && !curl ? " (EA's edge blocks plain requests; set EA_CURL_BIN to a curl-impersonate binary)" : "";
      throw new EaError(`EA API returned HTTP ${raw.status}${hint}`, raw.status);
    }
    if (!raw.text.trim()) return null;
    try {
      return JSON.parse(raw.text);
    } catch {
      throw new EaError("EA API returned a non-JSON response");
    }
  }
  throw failure;
}

type Obj = Record<string, unknown>;

/** EA's *Info endpoints return an object keyed by clubId instead of a list; both become a list. */
export function normalizeRecords(data: unknown): Obj[] {
  if (data === null || data === undefined) return [];
  if (Array.isArray(data)) return data as Obj[];
  if (typeof data === "object") return Object.values(data as Obj) as Obj[];
  return [];
}

async function searchRaw(platform: string, clubName: string): Promise<Obj[]> {
  const data = await eaGet("allTimeLeaderboard/search", { platform, clubName });
  return normalizeRecords(data).filter((r) => r.clubId);
}

export async function searchClub(platform: string, clubName: string): Promise<{ clubId: string; name: string }[]> {
  return (await searchRaw(platform, clubName)).map((r) => ({
    clubId: String(r.clubId),
    name: String(r.clubName ?? (r.clubInfo as Obj | undefined)?.name ?? ""),
  }));
}

export async function clubInfo(platform: string, clubId: string): Promise<Obj | null> {
  return normalizeRecords(await eaGet("clubs/info", { platform, clubIds: clubId }))[0] ?? null;
}

export async function overallStats(platform: string, clubId: string): Promise<Obj | null> {
  return normalizeRecords(await eaGet("clubs/overallStats", { platform, clubIds: clubId }))[0] ?? null;
}

/**
 * The club's record from EA's ALL-TIME LEADERBOARD: a frozen snapshot, NOT the
 * current standing, so nothing may present it as "now" (it once reported 111
 * matches out of date). It is used only to bucket the league table: a stale
 * tier compared against other clubs' equally stale tiers is self-consistent.
 * The only way in is by name, so it filters on clubId afterwards: a name
 * collision gives the right club or nothing.
 */
export async function divisionStats(platform: string, clubId: string): Promise<Obj | null> {
  const info = await clubInfo(platform, clubId);
  const name = info?.name;
  if (!name) return null;
  return (await searchRaw(platform, String(name))).find((r) => String(r.clubId) === String(clubId)) ?? null;
}

export async function memberStats(platform: string, clubId: string): Promise<Obj[]> {
  const data = (await eaGet("members/stats", { platform, clubId })) as { members?: unknown } | null;
  return Array.isArray(data?.members) ? (data!.members as Obj[]) : [];
}

export async function matchesStats(platform: string, clubId: string, matchType: string, maxResults = 10): Promise<unknown[]> {
  if (!["leagueMatch", "playoffMatch", "friendlyMatch"].includes(matchType)) throw new EaError(`unknown matchType '${matchType}'`, 400);
  const data = await eaGet("clubs/matches", { platform, clubIds: clubId, matchType, maxResultCount: maxResults });
  return Array.isArray(data) ? data : [];
}

export { divisionLabel };
