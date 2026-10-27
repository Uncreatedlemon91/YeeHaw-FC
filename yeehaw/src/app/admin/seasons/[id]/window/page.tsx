import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AdminCallout } from "@/components/admin-parts";
import { ConfirmButton } from "@/components/confirm-button";
import { ContractBadge, SeasonBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SQUAD_STATUS_LABEL } from "@/config/club";
import { formatObjectives } from "@/lib/contract-rules";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";
import { resendOffer, sendOffers, withdrawFromWindow } from "../../actions";
import { WindowForm, type WindowRow } from "./window-form";

export const metadata = { title: "Re-signing window" };
export const dynamic = "force-dynamic";

// The re-signing window: last season's players with their terms prefilled.
// Management edit, untick to let someone go, add others, then Send offers.
export default async function SeasonWindow({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = await prisma.season.findUnique({ where: { id } });
  if (!season) notFound();

  const back = (
    <Link href="/admin/seasons" className="mb-4 inline-block text-sm text-accent underline underline-offset-2">
      All seasons
    </Link>
  );
  if (season.state === "DRAFT" || season.state === "ENDED") {
    return (
      <>
        {back}
        <AdminCallout title={season.state === "DRAFT" ? "The window isn't open yet" : "This season is over"}>
          {season.state === "DRAFT"
            ? `Open the window on the seasons page (it also opens on its own on ${fmtDate(season.windowOpensAt)}), then come back to send offers.`
            : "Offers can't be sent for a season that has ended."}
        </AdminCallout>
      </>
    );
  }

  // The previous season: the latest one that started before this one.
  const previous = await prisma.season.findFirst({
    where: { startsAt: { lt: season.startsAt }, state: { in: ["ACTIVE", "ENDED"] } },
    orderBy: { startsAt: "desc" },
  });
  const [mine, last] = await Promise.all([
    prisma.contract.findMany({ where: { seasonId: id }, include: { player: true }, orderBy: { offeredAt: "desc" } }),
    previous
      ? prisma.contract.findMany({
          where: { seasonId: previous.id, state: { in: ["ACTIVE", "ENDED"] } },
          include: { player: true, objectives: { orderBy: { position: "asc" } } },
          orderBy: [{ shirtNumber: { sort: "asc", nulls: "last" } }, { player: { displayName: "asc" } }],
        })
      : [],
  ]);
  const liveHere = new Set(mine.filter((c) => c.state === "OFFERED" || c.state === "ACTIVE").map((c) => c.playerId));

  const rows: WindowRow[] = last
    .filter((c) => !liveHere.has(c.playerId))
    .map((c) => ({
      playerId: c.playerId,
      name: c.player.displayName,
      note: `${previous!.name}: ${c.shirtNumber != null ? `#${c.shirtNumber}, ` : ""}${SQUAD_STATUS_LABEL[c.squadStatus]}`,
      previousContractId: c.id,
      defaults: {
        shirtNumber: c.shirtNumber,
        squadStatus: c.squadStatus,
        position: c.position,
        secondaryPosition: c.secondaryPosition,
        captaincy: c.captaincy,
        objectives: formatObjectives(c.objectives),
      },
    }));
  const onSheet = new Set([...rows.map((r) => r.playerId), ...liveHere]);
  const people = (await prisma.player.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true, gamertag: true } }))
    .filter((p) => !onSheet.has(p.id))
    .map((p) => ({ id: p.id, name: p.gamertag ? `${p.displayName} (${p.gamertag})` : p.displayName }));

  return (
    <>
      {back}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold uppercase">{season.name}</h2>
        <SeasonBadge state={season.state} />
        <span className="text-sm text-muted-foreground">
          starts {fmtDate(season.startsAt)}
          {previous && ` · re-signing from ${previous.name}`}
        </span>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Offers to send</CardTitle>
          <CardDescription>
            Terms are last season&apos;s; change what you like. Shirt numbers and armbands must be unique among everyone offered or under contract this season, and the sheet
            is checked as a whole before anything is sent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WindowForm action={sendOffers.bind(null, season.id)} rows={rows} people={people} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Already this season</CardTitle>
          <CardDescription>Offers out and contracts in force. Unanswered offers can be sent again or withdrawn.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {mine.length === 0 ? (
            <p className="px-5 text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>#</TH>
                  <TH>Player</TH>
                  <TH>State</TH>
                  <TH>Offered</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {mine.map((c) => (
                  <TR key={c.id}>
                    <TD className="tnum">{c.shirtNumber ?? "—"}</TD>
                    <TD>
                      <Link href={`/players/${c.player.slug}`} className="font-medium hover:underline">
                        {c.player.displayName}
                      </Link>
                    </TD>
                    <TD>
                      <ContractBadge state={c.state} />
                    </TD>
                    <TD className="text-xs text-muted-foreground">{fmtDate(c.offeredAt)}</TD>
                    <TD>
                      {c.state === "OFFERED" && (
                        <div className="flex flex-wrap justify-end gap-1">
                          <ActionForm action={resendOffer} className="flex-row">
                            <input type="hidden" name="contractId" value={c.id} />
                            <ConfirmButton size="sm" variant="ghost" message={`Send ${c.player.displayName}'s offer again`}>
                              Send again
                            </ConfirmButton>
                          </ActionForm>
                          <ActionForm action={withdrawFromWindow} className="flex-row">
                            <input type="hidden" name="contractId" value={c.id} />
                            <ConfirmButton size="sm" variant="ghost" message={`Withdraw ${c.player.displayName}'s offer`}>
                              Withdraw
                            </ConfirmButton>
                          </ActionForm>
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
