import { NextResponse } from "next/server";
import { evaluateAwards } from "@/lib/award-evaluator";
import { announceAutoNominationsLater } from "@/lib/award-notify";
import { recommendPromotions } from "@/lib/promotions";
import { checkInternalToken } from "@/lib/member-sync";

// The daily run, called by deploy/awards.sh (the ravenfall-awards timer):
// automatic award rules and promotion criteria are checked, and whoever meets
// one gets a nomination or promotion request for S1 to approve. Time-based
// criteria only change with the calendar, so they need a clock; everything is
// also checked when an after-action report is filed. Answers only to the
// shared internal token.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkInternalToken(req.headers.get("x-internal-token"))) {
    return new NextResponse("forbidden", { status: 403 });
  }
  try {
    const { created, examined } = await evaluateAwards();
    announceAutoNominationsLater(created);
    const promotions = await recommendPromotions();
    return NextResponse.json({ examined, nominated: created.length, promotions: promotions.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
