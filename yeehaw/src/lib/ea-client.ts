import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { divisionLabel } from "./ea-rules";

// Thin client for EA's unofficial Pro Clubs API (proclubs.ea.com/api/fc).
// Port of proclubs/ea_client.py. The API is undocumented and has no stability
// guarantees: endpoints, fields and platform codes have changed across titles.
//
// EA's edge (Akamai Bot Manager) fingerprints the TLS handshake and 403s
// plain scripted traffic that a browser gets through. The Python client used
// curl_cffi, which impersonates Chrome's handshake; Node's own fetch can't. So:
//   EA_FETCHER=curl_cffi (default)  each request runs scripts/ea_fetch.py with the
//                                   python in EA_PYTHON (the venv update.sh builds)
//   EA_FETCHER=fetch                fetch() with a browser's headers; EA will 403 it,
//                                   only useful from a network EA does not filter
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

type Raw = { status: number; text: string; retryAfter?: number };
type Exec = (file: string, args: string[], opts: { timeout: number; maxBuffer: number }) => Promise<{ stdout: string; stderr: string }>;

// Swapped by the tests, which stub the subprocess and the waits.
export const deps: { exec: Exec; sleep: (ms: number) => Promise<void>; fetcher: () => "curl_cffi" | "fetch" } = {
  exec: (file, args, opts) => execFileP(file, args, opts),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  fetcher: () => (process.env.EA_FETCHER === "fetch" ? "fetch" : "curl_cffi"),
};

let last = 0;

async function pace() {
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await deps.sleep(wait);
  last = Date.now();
}

async function viaFetch(url: string): Promise<Raw> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const ra = Number(res.headers.get("retry-after"));
  return { status: res.status, text: await res.text(), retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined };
}

/** The python that has curl_cffi: EA_PYTHON, else the venv update.sh makes in production. */
export function eaPython() {
  return process.env.EA_PYTHON || (process.env.NODE_ENV === "production" ? "/opt/yeehaw/venv/bin/python" : "python3");
}

/** scripts/ea_fetch.py's exit codes become a Raw (see the script's docstring). */
async function viaCurlCffi(base: string, params: Record<string, string>): Promise<Raw> {
  const script = path.join(process.cwd(), "scripts", "ea_fetch.py");
  const args = [script, base, ...Object.entries(params).map(([k, v]) => `${k}=${v}`)];
  try {
    const { stdout } = await deps.exec(eaPython(), args, { timeout: TIMEOUT_MS + 5_000, maxBuffer: 16 * 1024 * 1024 });
    return { status: 200, text: stdout };
  } catch (e) {
    const err = e as { code?: number | string; stderr?: string; message?: string };
    const stderr = (err.stderr ?? "").trim();
    if (err.code === 10) {
      const m = /status=(\d+) retry_after=(\S+)/.exec(stderr);
      const ra = Number(m?.[2]);
      return { status: Number(m?.[1]) || 0, text: "", retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined };
    }
    if (err.code === 12) throw new EaError(`${stderr || "curl_cffi is not installed"} (EA_PYTHON=${eaPython()})`, 500);
    if (err.code === 11) throw new Error(stderr || "request failed");
    if (err.code === "ENOENT") throw new EaError(`cannot run ${eaPython()}: set EA_PYTHON to the venv's python (update.sh creates /opt/yeehaw/venv)`, 500);
    throw new Error(stderr || err.message || "ea_fetch.py failed");
  }
}

/** EA read. Null for the empty 200 EA sends for "no data" (a club with no matches, a bad id). */
export async function eaGet(apiPath: string, params: Record<string, string | number>): Promise<unknown> {
  const platform = String(params.platform ?? "");
  if (!platform) throw new EaError("platform is required", 400);
  if (!(platform in PLATFORMS)) throw new EaError(`unknown platform '${platform}'`, 400);
  const strParams = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const base = BASE_URL + apiPath;
  const fetcher = deps.fetcher();

  let failure = new EaError("could not reach EA's API");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await pace();
    let raw: Raw;
    try {
      raw = fetcher === "fetch" ? await viaFetch(base + "?" + new URLSearchParams(strParams).toString()) : await viaCurlCffi(base, strParams);
    } catch (e) {
      if (e instanceof EaError) throw e;
      failure = new EaError(`could not reach EA's API: ${e instanceof Error ? e.message : e}`);
      if (attempt < MAX_ATTEMPTS) await deps.sleep(2000 * attempt);
      continue;
    }
    if (raw.status === 404) throw new EaError("not found: check the club ID / name and platform", 404);
    if (raw.status === 429 || raw.status >= 500) {
      failure = new EaError(`EA API returned HTTP ${raw.status}`, raw.status);
      if (attempt < MAX_ATTEMPTS) await deps.sleep(Math.min((raw.retryAfter ?? 2 * attempt) * 1000, 30_000));
      continue;
    }
    if (raw.status < 200 || raw.status >= 300) {
      const hint = raw.status === 403 && fetcher === "fetch" ? " (EA's edge blocks plain requests; use EA_FETCHER=curl_cffi)" : "";
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
