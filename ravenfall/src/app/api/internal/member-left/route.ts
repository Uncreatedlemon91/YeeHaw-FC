import { NextResponse } from "next/server";
import { memberLeft } from "@/lib/member-left";
import { checkInternalToken } from "@/lib/member-sync";

// Called by the gateway process (scripts/gateway.mjs) when someone leaves
// the Discord server, so Command hears about it while they still have a
// file here. Not for browsers: it answers only to the shared internal token.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkInternalToken(req.headers.get("x-internal-token"))) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const { discordId } = (await req.json().catch(() => ({}))) as { discordId?: unknown };
  if (typeof discordId !== "string" || !/^\d+$/.test(discordId)) {
    return NextResponse.json({ error: "discordId required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ outcome: await memberLeft(discordId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
