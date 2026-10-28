import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deps, eaGet, eaPython, EaError } from "./ea-client";

// The subprocess is stubbed: what matters is how ea_fetch.py's exit codes and
// stderr line are turned back into data, errors and retries.

type Call = { file: string; args: string[] };
const original = { ...deps };
let calls: Call[];
let waits: number[];

function stub(results: Array<{ stdout?: string } | { code: number | string; stderr?: string }>) {
  deps.exec = async (file, args) => {
    calls.push({ file, args });
    const r = results[Math.min(calls.length - 1, results.length - 1)];
    if ("code" in r) throw Object.assign(new Error("exit"), r);
    return { stdout: r.stdout ?? "", stderr: "" };
  };
}

beforeEach(() => {
  calls = [];
  waits = [];
  deps.sleep = async (ms) => void waits.push(ms);
  deps.fetcher = () => "curl_cffi";
  process.env.EA_PYTHON = "/venv/bin/python";
});
afterEach(() => {
  Object.assign(deps, original);
  delete process.env.EA_PYTHON;
});

describe("eaGet via ea_fetch.py", () => {
  it("passes the endpoint and params as key=value and parses the JSON", async () => {
    stub([{ stdout: '{"ok":1}' }]);
    expect(await eaGet("clubs/info", { platform: "common-gen5", clubIds: 123 })).toEqual({ ok: 1 });
    expect(calls[0].file).toBe("/venv/bin/python");
    expect(calls[0].args[0]).toMatch(/scripts[/\\]ea_fetch\.py$/);
    expect(calls[0].args.slice(1)).toEqual(["https://proclubs.ea.com/api/fc/clubs/info", "platform=common-gen5", "clubIds=123"]);
  });

  it("returns null for the empty 200 EA sends for no data", async () => {
    stub([{ stdout: "  \n" }]);
    expect(await eaGet("clubs/matches", { platform: "common-gen5" })).toBeNull();
  });

  it("maps HTTP 404 to a not-found error without retrying", async () => {
    stub([{ code: 10, stderr: "status=404 retry_after=-" }]);
    await expect(eaGet("clubs/info", { platform: "common-gen5" })).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(1);
  });

  it("reports a 403 as a plain HTTP error", async () => {
    stub([{ code: 10, stderr: "status=403 retry_after=-" }]);
    const err = await eaGet("clubs/info", { platform: "common-gen5" }).catch((e) => e);
    expect(err).toBeInstanceOf(EaError);
    expect(err.status).toBe(403);
  });

  it("retries a 429, honouring Retry-After, then succeeds", async () => {
    stub([{ code: 10, stderr: "status=429 retry_after=7" }, { stdout: "[1]" }]);
    expect(await eaGet("clubs/matches", { platform: "common-gen5" })).toEqual([1]);
    expect(calls).toHaveLength(2);
    expect(waits).toContain(7000);
  });

  it("retries a network failure (exit 11) and gives up after three attempts", async () => {
    stub([{ code: 11, stderr: "ConnectionError: timed out" }]);
    await expect(eaGet("clubs/info", { platform: "common-gen5" })).rejects.toThrow(/could not reach EA's API: ConnectionError/);
    expect(calls).toHaveLength(3);
  });

  it("fails fast, naming EA_PYTHON, when curl_cffi is missing (exit 12)", async () => {
    stub([{ code: 12, stderr: "curl_cffi is not installed" }]);
    await expect(eaGet("clubs/info", { platform: "common-gen5" })).rejects.toThrow(/EA_PYTHON=\/venv\/bin\/python/);
    expect(calls).toHaveLength(1);
  });

  it("fails fast when the python itself is missing", async () => {
    stub([{ code: "ENOENT" }]);
    await expect(eaGet("clubs/info", { platform: "common-gen5" })).rejects.toThrow(/cannot run/);
    expect(calls).toHaveLength(1);
  });

  it("rejects a non-JSON body", async () => {
    stub([{ stdout: "<html>" }]);
    await expect(eaGet("clubs/info", { platform: "common-gen5" })).rejects.toThrow(/non-JSON/);
  });

  it("validates the platform before spawning anything", async () => {
    stub([{ stdout: "{}" }]);
    await expect(eaGet("clubs/info", { platform: "ps2" })).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });
});

describe("eaPython", () => {
  it("defaults to the production venv, else python3", () => {
    delete process.env.EA_PYTHON;
    const env = process.env as Record<string, string | undefined>;
    const was = env.NODE_ENV;
    env.NODE_ENV = "production";
    expect(eaPython()).toBe("/opt/yeehaw/venv/bin/python");
    env.NODE_ENV = "development";
    expect(eaPython()).toBe("python3");
    env.NODE_ENV = was;
  });
});
