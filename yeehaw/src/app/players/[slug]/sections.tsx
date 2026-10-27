import Link from "next/link";
import { Check, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AttendanceBadge, ContractBadge, SquadStatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { TermsFields } from "@/components/contract-fields";
import { Redacted, RedactedBar } from "@/components/redacted";
import { TabLinks } from "@/components/tab-links";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { OBJECTIVE_LABEL, POSITION_LABEL, SQUAD_STATUS_LONG, WEEKDAYS } from "@/config/club";
import { formatObjectives } from "@/lib/contract-rules";
import { MAX_ARCHETYPE, MAX_BIO, PREFERRED_FEET } from "@/lib/lineup-rules";
import type { ContractRow, PlayerHub } from "@/lib/player-hub";
import { canAdd, canDelete, groupsPresent, type Entry } from "@/lib/service-record";
import { fmtDate } from "@/lib/time";
import {
  addServiceEntry,
  changeTerms,
  deleteServiceEntry,
  linkGamertag,
  offerFromHub,
  releasePlayer,
  respondOffer,
  updateAbout,
  withdrawContractOffer,
} from "./actions";

export const positionsText = (c: Pick<ContractRow, "position" | "secondaryPosition">) =>
  [c.position, c.secondaryPosition].filter((p): p is NonNullable<typeof p> => !!p).map((p) => POSITION_LABEL[p]).join(" / ");

const captainText = (c: ContractRow["captaincy"]) => (c === "CAPTAIN" ? "Captain" : c === "VICE" ? "Vice-captain" : "");

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background/40 px-3 py-2">
      <p className="field-label">{label}</p>
      <p className="tnum mt-0.5 font-display text-xl font-bold">{value}</p>
    </div>
  );
}

// --- A waiting offer ------------------------------------------------------ //

/** Accept / Decline for the player an offer names. */
export function OfferBanner({ offer }: { offer: ContractRow }) {
  return (
    <Card className="mb-5 border-accent/50">
      <CardHeader>
        <CardTitle>Contract offer: {offer.seasonName}</CardTitle>
        <CardDescription>
          {offer.shirtNumber != null ? `#${offer.shirtNumber} · ` : ""}
          {SQUAD_STATUS_LONG[offer.squadStatus]}
          {positionsText(offer) && ` · ${positionsText(offer)}`}
          {captainText(offer.captaincy) && ` · ${captainText(offer.captaincy)}`}
          {offer.objectives?.length ? ` · Objectives: ${formatObjectives(offer.objectives)}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={respondOffer} className="gap-3">
          <input type="hidden" name="contractId" value={offer.id} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="decision" value="accept" pendingText="Accepting…">
              <Check /> Accept
            </SubmitButton>
            <SubmitButton name="decision" value="decline" variant="outline" pendingText="Declining…">
              <X /> Decline
            </SubmitButton>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}

// --- Overview ------------------------------------------------------------- //

/** The player's own bio, preferred foot and build; shown only on their own hub. */
function AboutForm({ player }: { player: PlayerHub["player"] }) {
  return (
    <details className="mt-2 border-t pt-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-accent">Edit about me</summary>
      <ActionForm action={updateAbout} className="mt-3">
        <Field label="Bio" htmlFor="about-bio" help={`Up to ${MAX_BIO} characters.`}>
          <Textarea id="about-bio" name="bio" rows={4} maxLength={MAX_BIO} defaultValue={player.bio ?? ""} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Preferred foot" htmlFor="about-foot">
            <Select id="about-foot" name="preferredFoot" defaultValue={player.preferredFoot ?? ""}>
              <option value="">—</option>
              {PREFERRED_FEET.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </Field>
          <Field label="Build / archetype" htmlFor="about-build">
            <Input id="about-build" name="archetype" maxLength={MAX_ARCHETYPE} defaultValue={player.archetype ?? ""} placeholder="e.g. Box-to-box" />
          </Field>
        </div>
        <div>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}

export function Overview({ hub }: { hub: PlayerHub }) {
  const { player, totals } = hub;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Recorded matches</CardTitle>
            <CardDescription>Counted from the matches this site has recorded, not a whole EA career.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Appearances" value={totals.apps} />
              <Tile label="Goals" value={totals.goals} />
              <Tile label="Assists" value={totals.assists} />
              <Tile label="Avg rating" value={totals.rating?.toFixed(1) ?? "—"} />
              <Tile label="Man of the Match" value={totals.motm} />
              <Tile label="Clean sheets" value={totals.cleanSheets} />
              <Tile label="Best rating" value={totals.best?.toFixed(1) ?? "—"} />
              <Tile label="Last five" value={hub.form.length ? hub.form.map((r) => r.toFixed(1)).join(" ") : "—"} />
            </div>
            {!player.gamertag && <p className="mt-3 text-xs text-muted-foreground">No gamertag is linked yet, so no EA matches can be matched to this player.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Objectives</CardTitle>
            <CardDescription>Targets from the contract in force, measured against EA stats for the season.</CardDescription>
          </CardHeader>
          <CardContent>
            {hub.objectives === null ? (
              <Redacted clearance="Player & staff" lines={3} />
            ) : hub.objectives.length === 0 ? (
              <p className="text-sm text-muted-foreground">{hub.current ? "No objectives set for this season." : "No contract in force."}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {hub.objectives.map((o) => (
                  <li key={o.kind}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{OBJECTIVE_LABEL[o.kind]}</span>
                      <span className="tnum text-muted-foreground">
                        {o.progress.current ?? "—"} / {o.progress.target}
                        {o.kind === "ATTENDANCE" ? "%" : ""}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={OBJECTIVE_LABEL[o.kind]}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={o.progress.pct}
                      className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
                    >
                      <div className={`h-full ${o.progress.met ? "bg-success" : "bg-primary"}`} style={{ width: `${o.progress.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {player.bio ? <p>{player.bio}</p> : <p className="text-muted-foreground">Nothing written yet.</p>}
            <dl className="grid grid-cols-2 gap-2">
              <div>
                <dt className="field-label">Foot</dt>
                <dd>{player.preferredFoot ?? "—"}</dd>
              </div>
              <div>
                <dt className="field-label">Build</dt>
                <dd>{player.archetype ?? "—"}</dd>
              </div>
            </dl>
            {hub.viewer.isSelf && <AboutForm player={player} />}
          </CardContent>
        </Card>
        {hub.ribbons.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Honors</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1 text-sm">
                {hub.ribbons.map((r, i) => (
                  <li key={i}>{r.label}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// --- Contracts ------------------------------------------------------------ //

export function Contracts({ hub }: { hub: PlayerHub }) {
  const priv = hub.viewer.isSelf || hub.viewer.isStaff;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contracts</CardTitle>
        <CardDescription>One per season.{priv ? "" : " Terms are visible to the player and staff."}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {hub.contracts.length === 0 ? (
          <p className="px-5 text-sm text-muted-foreground">No contracts yet.</p>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Season</TH>
                <TH>#</TH>
                <TH>Status</TH>
                <TH>Positions</TH>
                <TH>Terms</TH>
                <TH>State</TH>
              </TR>
            </THead>
            <TBody>
              {hub.contracts.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.seasonName}</TD>
                  <TD className="tnum">{c.shirtNumber ?? "—"}</TD>
                  <TD>
                    <SquadStatusBadge status={c.squadStatus} />
                  </TD>
                  <TD>{positionsText(c) || "—"}</TD>
                  <TD className="max-w-xs text-xs text-muted-foreground">
                    {c.objectives === null ? (
                      <RedactedBar className="w-28" label="Restricted: player and staff only" />
                    ) : (
                      <>
                        {captainText(c.captaincy) && <span className="text-foreground">{captainText(c.captaincy)}. </span>}
                        {c.objectives.length ? formatObjectives(c.objectives) : "No objectives"}
                        {c.releaseNote && <span className="block">{c.releaseNote}</span>}
                        {c.roleError && <span className="block text-warning">Roles: {c.roleError}</span>}
                      </>
                    )}
                  </TD>
                  <TD>
                    <ContractBadge state={c.state} />
                    {c.endedAt && <span className="mt-1 block text-micro text-muted-foreground">{fmtDate(c.endedAt)}</span>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// --- Service record -------------------------------------------------------- //

export function ServiceRecord({ hub, group, base }: { hub: PlayerHub; group: string; base: string }) {
  const { viewer } = hub;
  const present = groupsPresent(hub.timeline);
  const shown = hub.timeline.filter((e) => !group || e.group === group || e.redacted);
  return (
    <div className="flex flex-col gap-5">
      {present.length > 1 && (
        <TabLinks
          label="Filter the service record"
          items={[
            { href: base, label: "All", active: !group },
            ...present.map((g) => ({ href: `${base}&group=${g.key}`, label: g.label, active: group === g.key })),
          ]}
          className="mb-0"
        />
      )}
      <Card>
        <CardContent className="px-0 py-0">
          {shown.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Nothing on the record yet.</p>
          ) : (
            <ol className="divide-y">
              {shown.map((e) => (
                <TimelineRow key={e.id} e={e} hub={hub} />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {canAdd(viewer) && (
        <Card>
          <CardHeader>
            <CardTitle>Add an entry</CardTitle>
            <CardDescription>A commendation is public, a warning is for the player and staff, a note is for staff only.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={addServiceEntry}>
              <input type="hidden" name="playerId" value={hub.player.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Kind" htmlFor="kind">
                  <Select id="kind" name="kind" defaultValue="COMMENDATION">
                    <option value="COMMENDATION">Commendation (public)</option>
                    <option value="WARNING">Warning (player and staff)</option>
                    <option value="NOTE">Note (staff only)</option>
                  </Select>
                </Field>
                <Field label="Date" htmlFor="occurredOn" help="Leave empty for today.">
                  <Input id="occurredOn" name="occurredOn" type="date" />
                </Field>
              </div>
              <Field label="Entry" htmlFor="body">
                <Textarea id="body" name="body" maxLength={1000} required />
              </Field>
              <SubmitButton className="self-start" pendingText="Adding…">
                Add entry
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TimelineRow({ e, hub }: { e: Entry; hub: PlayerHub }) {
  if (e.redacted)
    return (
      <li className="px-5 py-3">
        <p className="mb-2 text-xs text-muted-foreground">{e.what}</p>
        <Redacted clearance={e.clearance ?? "Player & staff"} lines={2} />
      </li>
    );
  const deletable =
    !!e.entryId &&
    canDelete(e.kind.toUpperCase() as "COMMENDATION" | "WARNING" | "NOTE", e.authorId ?? null, hub.viewer.userId, hub.viewer);
  return (
    <li className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:gap-4">
      <time className="tnum w-28 shrink-0 text-xs text-muted-foreground">{e.at ? fmtDate(e.at) : "Undated"}</time>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {e.title}
          {e.kind === "warning" && <span className="ml-2 text-micro uppercase tracking-label text-warning">Not public</span>}
          {e.kind === "note" && <span className="ml-2 text-micro uppercase tracking-label text-info">Staff only</span>}
        </p>
        {e.detail && <p className="whitespace-pre-line text-sm text-muted-foreground">{e.detail}</p>}
        {e.author && <p className="mt-0.5 text-xs text-muted-foreground">by {e.author}</p>}
      </div>
      {deletable && (
        <ActionForm action={deleteServiceEntry} className="shrink-0">
          <input type="hidden" name="entryId" value={e.entryId} />
          <ConfirmButton size="sm" variant="ghost" message="Delete this entry">
            Delete
          </ConfirmButton>
        </ActionForm>
      )}
    </li>
  );
}

// --- Attendance & availability ---------------------------------------------- //

export function AttendanceTab({ hub }: { hub: PlayerHub }) {
  const a = hub.attendance;
  if (!a)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attendance & availability</CardTitle>
          <CardDescription>Kept between the player and staff.</CardDescription>
        </CardHeader>
        <CardContent>
          <Redacted clearance="Player & staff" lines={4} />
        </CardContent>
      </Card>
    );
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
          <CardDescription>From events staff marked afterwards. Excused absences don&apos;t count against reliability.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Reliability" value={a.record.reliability != null ? `${a.record.reliability}%` : "—"} />
            <Tile label="Present" value={a.record.present} />
            <Tile label="Absent" value={a.record.absent} />
            <Tile label="Excused" value={a.record.excused} />
          </div>
          {a.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events marked yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {a.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {r.title} <span className="text-xs text-muted-foreground">{fmtDate(r.startsAt)}</span>
                  </span>
                  <AttendanceBadge status={r.attendance} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Availability</CardTitle>
          <CardDescription>The nights they can usually play, and any time away.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {a.usualNights ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Usual nights">
              {WEEKDAYS.map((d, i) => (
                <li
                  key={d}
                  className={`rounded-sm border px-2 py-1 text-xs ${a.usualNights![i] === "1" ? "border-success/50 bg-success/15 text-success-fg" : "text-muted-foreground"}`}
                >
                  {d}
                  <span className="sr-only">{a.usualNights![i] === "1" ? ": usually free" : ": not usually free"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No usual nights set.</p>
          )}
          {a.availabilityNote && <p className="text-muted-foreground">{a.availabilityNote}</p>}
          {a.away.length > 0 && (
            <ul className="divide-y">
              {a.away.map((w) => (
                <li key={w.id} className="py-2">
                  Away {fmtDate(w.startsOn)} to {fmtDate(w.endsOn)}
                  {w.note && <span className="text-muted-foreground"> · {w.note}</span>}
                </li>
              ))}
            </ul>
          )}
          {hub.viewer.isSelf && (
            <Link href="/availability" className="text-accent underline underline-offset-2">
              Update my availability
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Management panel ------------------------------------------------------ //

export function ManagePanel({ hub }: { hub: PlayerHub }) {
  const { current, player } = hub;
  const offers = hub.pending;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      {current && (
        <Card>
          <CardHeader>
            <CardTitle>Change terms: {current.seasonName}</CardTitle>
            <CardDescription>Applied straight away. The player gets a DM listing what changed; there is no re-offer.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={changeTerms}>
              <input type="hidden" name="contractId" value={current.id} />
              <TermsFields
                defaults={{ ...current, objectives: formatObjectives(current.objectives ?? []) }}
              />
              <SubmitButton className="self-start" pendingText="Saving…">
                Save changes
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {current && (
        <Card>
          <CardHeader>
            <CardTitle>Release</CardTitle>
            <CardDescription>Ends the contract now, takes the squad roles off and posts a departure to the roster channel.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={releasePlayer}>
              <input type="hidden" name="contractId" value={current.id} />
              <Field label="Note for the departure post (optional)" htmlFor="release-note">
                <Textarea id="release-note" name="note" maxLength={500} className="min-h-16" />
              </Field>
              <div>
                <ConfirmButton variant="destructive" message={`Release ${player.displayName}`}>
                  Release {player.displayName}
                </ConfirmButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {offers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Open offers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {offers.map((o) => (
              <ActionForm key={o.id} action={withdrawContractOffer} className="flex-row flex-wrap items-center justify-between gap-2">
                <input type="hidden" name="contractId" value={o.id} />
                <span className="text-sm">
                  {o.seasonName}: {o.shirtNumber != null ? `#${o.shirtNumber}, ` : ""}
                  {SQUAD_STATUS_LONG[o.squadStatus]}
                </span>
                <ConfirmButton size="sm" variant="outline" message="Withdraw this offer">
                  Withdraw
                </ConfirmButton>
              </ActionForm>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Offer a contract</CardTitle>
          <CardDescription>
            Sent to the player in Discord with Accept and Decline buttons; they can also answer on this page. For a whole squad at once use the{" "}
            <Link href="/admin/seasons" className="text-accent underline underline-offset-2">
              re-signing window
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hub.seasonsForOffer.length === 0 ? (
            <p className="text-sm text-muted-foreground">No season has an open window or is running. Open one under Admin, Seasons & contracts.</p>
          ) : (
            <ActionForm action={offerFromHub}>
              <input type="hidden" name="playerId" value={player.id} />
              <Field label="Season" htmlFor="seasonId" className="max-w-xs">
                <Select id="seasonId" name="seasonId">
                  {hub.seasonsForOffer.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.state === "WINDOW" ? "window open" : "running"})
                    </option>
                  ))}
                </Select>
              </Field>
              <TermsFields />
              <SubmitButton className="self-start" pendingText="Sending…">
                Send offer
              </SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>EA gamertag</CardTitle>
          <CardDescription>Matches EA&apos;s per-player lines to this person. Leave empty to unlink.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={linkGamertag}>
            <input type="hidden" name="playerId" value={player.id} />
            <Field label="Gamertag" htmlFor="gamertag">
              <Input id="gamertag" name="gamertag" defaultValue={player.gamertag ?? ""} maxLength={64} autoComplete="off" />
            </Field>
            <SubmitButton variant="secondary" className="self-start" pendingText="Saving…">
              Save gamertag
            </SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

export { Tile };
