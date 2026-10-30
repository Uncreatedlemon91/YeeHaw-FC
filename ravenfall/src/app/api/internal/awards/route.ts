import { NextResponse } from "next/server";
import { evaluateAwards } from "@/lib/award-evaluator";
import { announceLater } from "@/lib/award-notify";
import { checkInternalToken } from "@/lib/member-sync";

// The daily automatic-award run, called by deploy/awards.sh (the
// ravenfall-awards timer). Service days and good conduct only change with
// the calendar, so they need a clock; everything else is also evaluated when
// an after-action report is filed. Answers only to the shared internal token.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkInternalToken(req.headers.get("x-internal-token"))) {
    return new NextResponse("forbidden", { status: 403 });
  }
  try {
    const { created, examined } = await evaluateAwards();
    announceLater(created);
    return NextResponse.json({ examined, awarded: created.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
