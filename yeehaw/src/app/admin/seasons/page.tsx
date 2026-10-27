import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AdminCallout } from "@/components/admin-parts";
import { ConfirmButton } from "@/components/confirm-button";
import { ContractBadge, SeasonBadge, SquadStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { POSITION_LABEL } from "@/config/club";
import { prisma } from "@/lib/prisma";
import { fmtDate, toInput } from "@/lib/time";
import { createSeasonAction, deleteSeasonAction, transitionSeasonAction, updateSeasonAction } from "./actions";
import type { Season, SeasonState } from "@prisma/client";

export const metadata = { title: "Seasons & contracts" };
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

function SeasonFields({ s, newOne }: { s?: Season; newOne?: boolean }) {
  // New seasons default to the 12-week shape the club runs: window a week before.
  const start = new Date(Date.now() + 14 * DAY);
  const d = {
    startsAt: s?.startsAt ?? start,
    endsAt: s?.endsAt ?? new Date(start.getTime() + 84 * DAY),
    windowOpensAt: s?.windowOpensAt ?? new Date(start.getTime() - 7 * DAY),
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Name" htmlFor={`name-${s?.id ?? "new"}`}>
        <Input id={`name-${s?.id ?? "new"}`} name="name" defaultValue={s?.name ?? ""} placeholder={newOne ? "Season 3" : undefined} required />
      </Field>
      <Field label="Window opens" htmlFor={`w-${s?.id ?? "new"}`}>
        <Input id={`w-${s?.id ?? "new"}`} name="windowOpensAt" type="datetime-local" defaultValue={toInput(d.windowOpensAt)} required />
      </Field>
      <Field label="Starts" htmlFor={`s-${s?.id ?? "new"}`}>
        <Input id={`s-${s?.id ?? "new"}`} name="startsAt" type="datetime-local" defaultValue={toInput(d.startsAt)} required />
      </Field>
      <Field label="Ends" htmlFor={`e-${s?.id ?? "new"}`}>
        <Input id={`e-${s?.id ?? "new"}`} name="endsAt" type="datetime-local" defaultValue={toInput(d.endsAt)} required />
      </Field>
    </div>
  );
}

const MOVES: Record<SeasonState, { to: SeasonState; label: string; hint: string; destructive?: boolean }[]> = {
  DRAFT: [
    { to: "WINDOW", label: "Open window", hint: "Management can send re-signing offers. The daily job also does this on the window date." },
    { to: "ACTIVE", label: "Start now", hint: "Skip the window (a first season)." },
  ],
  WINDOW: [
    { to: "ACTIVE", label: "Start season", hint: "Ends the running season and announces this squad." },
    { to: "DRAFT", label: "Back to draft", hint: "Only while no offers are out." },
  ],
  ACTIVE: [{ to: "ENDED", label: "End season", hint: "Contracts end, squad roles come off players without a contract in the next season.", destructive: true }],
  ENDED: [],
};

export default async function AdminSeasons({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const sp = await searchParams;
  const seasons = await prisma.season.findMany({
    orderBy: { startsAt: "desc" },
    include: { contracts: { select: { state: true } } },
  });
  const selected =
    seasons.find((s) => s.id === sp.season) ??
    seasons.find((s) => s.state === "ACTIVE") ??
    seasons.find((s) => s.state === "WINDOW") ??
    seasons[0];
  const contracts = selected
    ? await prisma.contract.findMany({
        where: { seasonId: selected.id },
        include: { player: true },
        orderBy: [{ shirtNumber: { sort: "asc", nulls: "last" } }, { player: { displayName: "asc" } }],
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      {seasons.length === 0 && (
        <AdminCallout title="No season yet">
          Create the first one below. A season runs Draft, Re-signing window, Active, Ended; every player has one contract per season.
        </AdminCallout>
      )}

      {seasons.map((s) => {
        const live = s.contracts.filter((c) => c.state === "ACTIVE").length;
        const offered = s.contracts.filter((c) => c.state === "OFFERED").length;
        return (
          <Card key={s.id} className={selected?.id === s.id ? "border-primary/60" : undefined}>
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  {s.name} <SeasonBadge state={s.state} />
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  {(s.state === "WINDOW" || s.state === "ACTIVE") && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/seasons/${s.id}/window`}>{s.state === "WINDOW" ? "Re-signing window" : "Send offers"}</Link>
                    </Button>
                  )}
                  {selected?.id !== s.id && (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/seasons?season=${s.id}`}>Show contracts</Link>
                    </Button>
                  )}
                </div>
              </div>
              <CardDescription>
                {fmtDate(s.startsAt)} to {fmtDate(s.endsAt)} · window opens {fmtDate(s.windowOpensAt)} · {live} under contract
                {offered ? `, ${offered} offer${offered === 1 ? "" : "s"} open` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {MOVES[s.state].length > 0 && (
                <div className="flex flex-wrap gap-4">
                  {MOVES[s.state].map((m) => (
                    <ActionForm key={m.to} action={transitionSeasonAction.bind(null, s.id, m.to)} className="gap-1">
                      <div className="flex items-center gap-2">
                        <ConfirmButton size="sm" variant={m.destructive ? "destructive" : "secondary"} message={`${m.label}: ${s.name}`}>
                          {m.label}
                        </ConfirmButton>
                      </div>
                      <p className="max-w-xs text-xs text-muted-foreground">{m.hint}</p>
                    </ActionForm>
                  ))}
                </div>
              )}
              {s.state !== "ENDED" && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">Edit name and dates</summary>
                  <ActionForm action={updateSeasonAction.bind(null, s.id)} className="mt-3">
                    <SeasonFields s={s} />
                    <SubmitButton variant="secondary" className="self-start" pendingText="Saving…">
                      Save
                    </SubmitButton>
                  </ActionForm>
                </details>
              )}
              {s.state === "DRAFT" && s.contracts.length === 0 && (
                <ActionForm action={deleteSeasonAction.bind(null, s.id)} className="flex-row">
                  <ConfirmButton size="sm" variant="ghost" message={`Delete ${s.name}`}>
                    Delete draft
                  </ConfirmButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>New season</CardTitle>
          <CardDescription>Starts as a draft. Times are club time.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createSeasonAction}>
            <SeasonFields newOne />
            <SubmitButton className="self-start" pendingText="Creating…">
              Create season
            </SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>Contracts: {selected.name}</CardTitle>
            <CardDescription>Everyone with a contract or an offer this season. Open a name to change terms or release.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {contracts.length === 0 ? (
              <p className="px-5 text-sm text-muted-foreground">No contracts yet.</p>
            ) : (
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>#</TH>
                    <TH>Player</TH>
                    <TH>Status</TH>
                    <TH>Positions</TH>
                    <TH>Armband</TH>
                    <TH>State</TH>
                  </TR>
                </THead>
                <TBody>
                  {contracts.map((c) => (
                    <TR key={c.id}>
                      <TD className="tnum">{c.shirtNumber ?? "—"}</TD>
                      <TD>
                        <Link href={`/players/${c.player.slug}?tab=manage`} className="font-medium hover:underline">
                          {c.player.displayName}
                        </Link>
                        {c.roleError && c.state === "ACTIVE" && <span className="block text-xs text-warning">Roles: {c.roleError}</span>}
                      </TD>
                      <TD>
                        <SquadStatusBadge status={c.squadStatus} />
                      </TD>
                      <TD>{[c.position, c.secondaryPosition].filter((p): p is NonNullable<typeof p> => !!p).map((p) => POSITION_LABEL[p]).join(" / ") || "—"}</TD>
                      <TD>{c.captaincy === "CAPTAIN" ? "Captain" : c.captaincy === "VICE" ? "Vice" : ""}</TD>
                      <TD>
                        <ContractBadge state={c.state} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
