import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/member-sync";
import { prisma } from "@/lib/prisma";

// The gateway process (scripts/gateway.mjs) checks in here on connect and
// every 5 minutes, so the Admin page can say whether the bot is online.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkInternalToken(req.headers.get("x-internal-token"))) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { tag?: unknown; members?: unknown };
  const value = { at: new Date().toISOString(), tag: String(body.tag ?? "?").slice(0, 64), members: body.members === true };
  await prisma.setting.upsert({ where: { key: "gateway" }, create: { key: "gateway", value }, update: { value } });
  return NextResponse.json({ ok: true });
}
