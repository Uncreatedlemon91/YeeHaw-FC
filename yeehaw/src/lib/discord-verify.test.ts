import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "./discord-verify";

// A fresh Ed25519 key standing in for the Discord application's.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const rawPublic = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const body = '{"type":1}';
const ts = "1700000000";
const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");

describe("verifySignature", () => {
  it("accepts a correctly signed request", () => {
    expect(verifySignature(body, sig, ts, rawPublic)).toBe(true);
  });
  it("rejects a tampered body or timestamp", () => {
    expect(verifySignature(body + " ", sig, ts, rawPublic)).toBe(false);
    expect(verifySignature(body, sig, "1700000001", rawPublic)).toBe(false);
  });
  it("rejects missing headers, an unset key and garbage", () => {
    expect(verifySignature(body, null, ts, rawPublic)).toBe(false);
    expect(verifySignature(body, sig, null, rawPublic)).toBe(false);
    expect(verifySignature(body, sig, ts, "")).toBe(false);
    expect(verifySignature(body, "zz", ts, rawPublic)).toBe(false);
    expect(verifySignature(body, sig, ts, "not-hex")).toBe(false);
  });
});
