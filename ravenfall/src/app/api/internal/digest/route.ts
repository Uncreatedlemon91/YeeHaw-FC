import { NextResponse } from "next/server";
import { postDigest } from "@/lib/digest";
import { checkInternalToken } from "@/lib/member-sync";

// The weekly digest, called by deploy/digest.sh (the ravenfall-digest timer).
// Posts once per week whatever the timer does. Answers only to the shared
// internal token.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkInternalToken(req.headers.get("x-internal-token"))) {
    return new NextResponse("forbidden", { status: 403 });
  }
  try {
    return NextResponse.json(await postDigest());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
