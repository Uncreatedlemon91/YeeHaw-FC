import { createPublicKey, verify } from "node:crypto";

// Ed25519 over timestamp + body, as Discord requires of an interactions
// endpoint. Node's crypto wants the raw 32-byte public key wrapped in an SPKI
// header. Kept apart from the route so it can be tested with a generated key.
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifySignature(body: string, signature: string | null, timestamp: string | null, publicKeyHex: string): boolean {
  if (!signature || !timestamp || !publicKeyHex) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
