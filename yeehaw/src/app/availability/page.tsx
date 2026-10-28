import { Check, CircleHelp, Minus, X } from "lucide-react";
import Link from "next/link";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { ChipCheckbox } from "@/components/chip";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SQUAD_STATUS_LABEL, WEEKDAYS } from "@/config/club";
import { requireUser } from "@/lib/auth";
import { loadGrid, loadMine } from "@/lib/availability";
import type { GridState } from "@/lib/availability-rules";
import { weekdayOf } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { addAwayAction, removeAwayAction, savePatternAction } from "./actions";

export const metadata = { title: "Availability" };
export const dynamic = "force-dynamic";

const asAct = (a: unknown) => a as (p: ActionState, d: FormData) => Promise<ActionState>;

// Mark, label and look of each state. Icons and words, never colour alone.
const MARKS: Record<GridState, { icon: React.ReactNode; label: string; cell: string }> = {
  free: { icon: <Check className="size-3.5" />, label: "Free", cell: "bg-success/15 text-success-fg" },
  going: { icon: <Check className="size-3.5" />, label: "Going", cell: "bg-success/30 text-success-fg font-bold" },
  maybe: { icon: <CircleHelp className="size-3.5" />, label: "Maybe", cell: "bg-accent/15 text-accent" },
  out: { icon: <X className="size-3.5" />, label: "Can't make it", cell: "bg-destructive/15 text-destructive-fg" },
  away: { icon: <Minus className="size-3.5" />, label: "Away", cell: "bg-muted text-muted-foreground" },
  busy: { icon: <span aria-hidden>·</span>, label: "Not usually", cell: "text-muted-foreground/60" },
  unknown: { icon: null, label: "No nights set", cell: "text-muted-foreground/60" },
};

const fmtDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function AvailabilityPage() {
  const user = await requireUser("MEMBER", "/availability");
  const [mine, grid] = await Promise.all([loadMine(user.id), loadGrid()]);
  const set = new Set(mine.days ? [...mine.days].flatMap((c, i) => (c === "1" ? [i] : [])) : []);

  return (
    <Container>
      <PageHeader
        eyebrow="Members"
        title="Availability"
        description="Who can play over the next two weeks. Set your usual nights once and add any dates you're away; a fixture's own answers override both."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>The squad, night by night</CardTitle>
            <CardDescription>Next {grid.days.length} days.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {grid.rows.length === 0 ? (
              <p className="px-5 text-sm text-muted-foreground">Nobody is under contract yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th scope="col" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                        Player
                      </th>
                      {grid.days.map((d) => {
                        const evs = grid.eventsOn.get(d) ?? [];
                        return (
                          <th key={d} scope="col" className={cn("min-w-9 px-1 py-2 text-center font-semibold", weekdayOf(d) >= 5 && "bg-secondary/40")}>
                            <span className="block uppercase text-muted-foreground">{WEEKDAYS[weekdayOf(d)]}</span>
                            <span className="tnum block">{Number(d.slice(8))}</span>
                            {evs.length > 0 && (
                              <Link href={`/fixtures/${evs[0].id}`} title={evs.map((e) => e.title).join(", ")} aria-label={`Fixture: ${evs[0].title}`} className="text-accent">
                                ●
                              </Link>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.rows.map((r) => (
                      <tr key={r.id} className={cn("border-t", r.id === user.id && "bg-accent/5")}>
                        <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-normal">
                          <Link href={`/players/${r.slug}`} className="block max-w-36 truncate font-semibold hover:underline">
                            {r.name}
                          </Link>
                          <span className="block text-micro text-muted-foreground">
                            {r.status ? SQUAD_STATUS_LABEL[r.status as keyof typeof SQUAD_STATUS_LABEL] : "Staff"}
                            {!r.patternSet && " · no nights set"}
                          </span>
                        </th>
                        {r.cells.map((c, i) => {
                          const m = MARKS[c.state];
                          return (
                            <td key={i} title={m.label} className={cn("h-9 text-center", m.cell)}>
                              <span className="inline-flex items-center justify-center" aria-hidden>
                                {m.icon}
                              </span>
                              <span className="sr-only">{m.label}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                        Free or going
                      </th>
                      {grid.counts.map((n, i) => (
                        <td key={i} className={cn("tnum text-center font-bold", n >= 11 && "text-success-fg")}>
                          {n}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pt-4 text-xs text-muted-foreground">
              {(["free", "going", "maybe", "out", "away", "busy", "unknown"] as const).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className={cn("inline-flex size-5 items-center justify-center rounded-sm", MARKS[s].cell)} aria-hidden>
                    {MARKS[s].icon}
                  </span>
                  {MARKS[s].label}
                </li>
              ))}
              <li>
                <span className="text-accent">●</span> Fixture that night
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your usual nights</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={asAct(savePatternAction)}>
                <fieldset>
                  <legend className="sr-only">Nights you can usually play</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((d, i) => (
                      <ChipCheckbox key={d} name="day" value={i} defaultChecked={set.has(i)} chipClassName="min-w-11 text-center">
                        {d}
                      </ChipCheckbox>
                    ))}
                  </div>
                </fieldset>
                <Field label="Note (optional)" htmlFor="note">
                  <Input id="note" name="note" maxLength={140} defaultValue={mine.note ?? ""} placeholder="e.g. Not before 9pm ET on weekdays" />
                </Field>
                <div>
                  <SubmitButton pendingText="Saving…">Save</SubmitButton>
                </div>
                {!mine.days && <p className="text-xs text-muted-foreground">Until you set these, the bot asks you every Monday.</p>}
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Away</CardTitle>
              <CardDescription>Dates you can&apos;t play, whatever your usual nights.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {mine.away.length > 0 && (
                <ul className="divide-y text-sm">
                  {mine.away.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        {fmtDay(a.startsOn)}
                        {a.endsOn !== a.startsOn && ` to ${fmtDay(a.endsOn)}`}
                        {a.note && <span className="text-muted-foreground"> · {a.note}</span>}
                      </span>
                      <ActionForm action={asAct(removeAwayAction)} className="gap-0">
                        <input type="hidden" name="id" value={a.id} />
                        <SubmitButton size="sm" variant="ghost" pendingText="…">
                          Remove
                        </SubmitButton>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}
              <ActionForm action={asAct(addAwayAction)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="From" htmlFor="startsOn">
                    <Input id="startsOn" name="startsOn" type="date" min={mine.today} required />
                  </Field>
                  <Field label="To (optional)" htmlFor="endsOn">
                    <Input id="endsOn" name="endsOn" type="date" min={mine.today} />
                  </Field>
                </div>
                <Field label="Note (optional)" htmlFor="away-note">
                  <Input id="away-note" name="note" maxLength={140} placeholder="e.g. Holiday" />
                </Field>
                <div>
                  <SubmitButton variant="secondary" pendingText="Adding…">
                    Add away dates
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}
