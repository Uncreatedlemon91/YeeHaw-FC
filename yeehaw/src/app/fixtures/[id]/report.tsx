import Link from "next/link";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { MAX_COMMENT, MAX_NOTES, type Report } from "@/lib/match-report";
import { RATING_WORDS } from "@/lib/recognition-rules";
import { fmt } from "@/lib/time";
import { openVoteAction, saveReportAction, voteAction } from "../actions";

type Act = (p: ActionState, d: FormData) => Promise<ActionState>;
const asAct = (a: unknown) => a as Act;

const score = (us: number | null, opp: number | null) => `${us ?? "?"}–${opp ?? "?"}`;
const RATINGS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

// The match report on the event page: the result and scorers from the EA
// matches linked to the event, everyone's EA ratings, the Man of the Match
// vote and each player's own rating (port of match_report.html). Staff write
// the key moments and coach ratings below it and publish.
export function ReportCard({ report, member }: { report: Report; member: boolean }) {
  const { event } = report;
  return (
    <Card id="report">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Match report
          {event.reviewPublishedAt && <Badge variant="success">Published</Badge>}
          {report.voteState === "open" && <Badge variant="accent">Voting open</Badge>}
        </CardTitle>
        {event.reviewPublishedBy && <CardDescription>by {event.reviewPublishedBy}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-5 text-sm">
        {!report.started ? (
          <p className="text-muted-foreground">The report opens after kick-off. Voting for Man of the Match opens two hours in.</p>
        ) : (
          <>
            <Result report={report} />
            {report.matches.map((m) => (
              <details key={m.id} className="rounded-md border" open={report.matches.length === 1}>
                <summary className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <Badge variant={m.outcome === "W" ? "success" : m.outcome === "L" ? "destructive" : "outline"}>{m.outcome}</Badge>
                  <span className="tnum font-bold">{score(m.usScore, m.oppScore)}</span>
                  <span className="text-muted-foreground">vs {m.oppName ?? "Unknown"}</span>
                  {m.forfeit && <Badge variant="outline">Forfeit</Badge>}
                  {m.playedAt && <span className="ml-auto text-xs text-muted-foreground">{fmt(m.playedAt, "HH:mm")}</span>}
                </summary>
                <MatchLines match={m} />
              </details>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="field-label">Man of the Match</p>
                {report.winners.length ? (
                  <p className="mt-1">
                    <span className="font-display text-lg font-bold">{report.winners.map((w) => w.name).join(" & ")}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {report.winnerVotes} of {report.voteTotal} votes
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    {report.voteState === "open" ? `Voting open, ${report.voteTotal} vote${report.voteTotal === 1 ? "" : "s"} so far.` : report.voteState === "closed" ? "No votes cast." : "Voting opens two hours after kick-off."}
                  </p>
                )}
              </div>
              <div>
                <p className="field-label">Top rated (EA)</p>
                {report.top.length ? (
                  <ol className="mt-1">
                    {report.top.map((t) => (
                      <li key={t.name}>
                        {t.name} <span className="tnum font-semibold text-accent">{t.rating.toFixed(1)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-1 text-muted-foreground">EA hasn&apos;t recorded this match night yet.</p>
                )}
              </div>
            </div>
            {event.reviewNotes ? <p className="whitespace-pre-wrap rounded-md border-l-2 border-accent bg-accent/5 px-3 py-2">{event.reviewNotes}</p> : !report.isStaff && <p className="text-muted-foreground">The coaches haven&apos;t written up this one yet.</p>}
            {report.clips.length > 0 && (
              <ul className="list-disc pl-5">
                {report.clips.map((c) => (
                  <li key={c}>
                    <a href={c} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                      {c}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {report.me && <YourPart report={report} />}
            {!report.me && !member && report.voteState === "open" && (
              <p className="text-muted-foreground">
                <Link href={`/login?callbackUrl=/fixtures/${event.id}`} className="text-accent underline underline-offset-2">
                  Sign in
                </Link>{" "}
                if you played, to vote and rate your game.
              </p>
            )}
          </>
        )}
        {report.isStaff && report.started && <StaffReport report={report} />}
      </CardContent>
    </Card>
  );
}

function Result({ report }: { report: Report }) {
  const { night, event } = report;
  if (!night) {
    const text = event.usScore != null && event.oppScore != null ? score(event.usScore, event.oppScore) : event.result;
    return text ? (
      <p>
        <span className="field-label mr-2">Result</span>
        <span className="tnum font-display text-lg font-bold">{text}</span>
      </p>
    ) : (
      <p className="text-muted-foreground">The matches EA records in this event&apos;s window appear here once the stats poll has linked them (it runs hourly).</p>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
      <div>
        <p className="field-label">Full time</p>
        <p className="tnum font-display text-3xl font-bold">
          {night.gf}
          <span className="px-1 text-muted-foreground">:</span>
          {night.ga}
        </p>
      </div>
      <div>
        <p className="field-label">Record</p>
        <p className="tnum font-display text-xl font-bold">{night.record}</p>
      </div>
      <div>
        <p className="field-label">Goal difference</p>
        <p className={`tnum font-display text-xl font-bold ${night.gd > 0 ? "text-success-fg" : night.gd < 0 ? "text-destructive-fg" : ""}`}>{night.gdText}</p>
      </div>
      {report.scorers.length > 0 && (
        <div className="min-w-0">
          <p className="field-label">Scorers</p>
          <p>{report.scorers.map((s) => (s.goals > 1 ? `${s.name} (${s.goals})` : s.name)).join(", ")}</p>
        </div>
      )}
    </div>
  );
}

function MatchLines({ match }: { match: Report["matches"][number] }) {
  if (!match.players.length) return <p className="border-t px-3 py-2 text-muted-foreground">EA recorded no player lines for this match.</p>;
  return (
    <div className="overflow-x-auto border-t">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 font-semibold">Player</th>
            <th className="px-2 py-1.5 font-semibold">Pos</th>
            <th className="px-2 py-1.5 text-right font-semibold">Rating</th>
            <th className="px-2 py-1.5 text-right font-semibold">G</th>
            <th className="px-2 py-1.5 text-right font-semibold">A</th>
          </tr>
        </thead>
        <tbody>
          {match.players.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="px-3 py-1.5 font-medium">
                {p.player ? (
                  <Link href={`/players/${p.player.slug}`} className="hover:underline">
                    {p.player.displayName}
                  </Link>
                ) : (
                  p.playerName
                )}
                {p.mom && <Badge variant="accent" className="ml-2">EA MOTM</Badge>}
              </td>
              <td className="px-2 py-1.5 capitalize text-muted-foreground">{p.pos ?? "-"}</td>
              <td className="tnum px-2 py-1.5 text-right font-semibold">{p.rating ? p.rating.toFixed(1) : "-"}</td>
              <td className="tnum px-2 py-1.5 text-right">{p.goals ?? 0}</td>
              <td className="tnum px-2 py-1.5 text-right">{p.assists ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The signed-in player's vote and rating, and what the coach said about them. */
function YourPart({ report }: { report: Report }) {
  const me = report.me!;
  const { event } = report;
  return (
    <section className="flex flex-col gap-3 rounded-md border p-3" aria-labelledby="your-part">
      <h3 id="your-part" className="font-display text-sm font-bold uppercase">
        Your part
      </h3>
      {me.coachRating != null || me.coachComment ? (
        <p>
          <span className="field-label mr-2">Coach{me.coachName ? ` (${me.coachName})` : ""}</span>
          {me.coachRating != null && (
            <span className="tnum font-bold">
              {me.coachRating}/10 <span className="font-normal text-muted-foreground">{RATING_WORDS[me.coachRating]}</span>
            </span>
          )}
          {me.coachComment && <span className="mt-1 block text-muted-foreground">{me.coachComment}</span>}
        </p>
      ) : null}
      {report.voteState !== "open" ? (
        <p className="text-muted-foreground">{me.isParticipant ? (report.voteState === "closed" ? "Voting is closed." : "Voting opens two hours after kick-off.") : "Only players who were in the squad for this match can vote and rate."}</p>
      ) : !me.isParticipant ? (
        <p className="text-muted-foreground">Only players who were in the squad for this match can vote and rate.</p>
      ) : (
        <ActionForm action={asAct(voteAction)} className="gap-3">
          <input type="hidden" name="id" value={event.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Man of the Match" htmlFor="nominee">
              <Select id="nominee" name="nominee" defaultValue={me.vote ?? ""}>
                <option value="">No vote yet</option>
                {report.participants
                  .filter((p) => p.playerId !== me.id)
                  .map((p) => (
                    <option key={p.playerId} value={p.playerId}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Rate your own game" htmlFor="rating">
              <Select id="rating" name="rating" defaultValue={me.selfRating ? String(me.selfRating) : ""}>
                <option value="">Not rated</option>
                {RATINGS.map((n) => (
                  <option key={n} value={n}>
                    {n}: {RATING_WORDS[n]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div>
            <SubmitButton size="sm" pendingText="Saving…">
              Save my vote and rating
            </SubmitButton>
          </div>
        </ActionForm>
      )}
    </section>
  );
}

/** Staff: open the vote early, write the report, coach ratings, publish. */
function StaffReport({ report }: { report: Report }) {
  const { event } = report;
  return (
    <section className="flex flex-col gap-4 rounded-md border border-accent/30 p-3" aria-labelledby="write-report">
      <h3 id="write-report" className="font-display text-sm font-bold uppercase text-accent">
        Write the report (staff)
      </h3>
      {report.voteState === "not_yet" && report.isMatch && (
        <ActionForm action={asAct(openVoteAction)} className="flex-row items-center gap-3">
          <input type="hidden" name="id" value={event.id} />
          <SubmitButton size="sm" variant="outline" pendingText="Opening…">
            Open the vote now
          </SubmitButton>
          <span className="text-xs text-muted-foreground">It opens by itself two hours after kick-off.</span>
        </ActionForm>
      )}
      <ActionForm action={asAct(saveReportAction)}>
        <input type="hidden" name="id" value={event.id} />
        {report.night && (
          <p className="text-xs text-muted-foreground">
            EA recorded {report.night.games} match{report.night.games === 1 ? "" : "es"} in this window ({report.night.record}, goal difference {report.night.gdText}); the report adds them up by itself.
          </p>
        )}
        <Field label="Key moments" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={5} maxLength={MAX_NOTES} defaultValue={event.reviewNotes ?? ""} placeholder="What decided it, what worked, what to fix." />
        </Field>
        <Field label="Clips (links, one per line)" htmlFor="clips">
          <Textarea id="clips" name="clips" rows={2} defaultValue={event.reviewClips ?? ""} placeholder="https://…" />
        </Field>
        {report.coach.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="field-label">Coach ratings</p>
            <p className="text-xs text-muted-foreground">Each player sees their own rating and comment on this page, nobody else&apos;s.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 font-semibold">Player</th>
                    <th className="px-2 py-1 text-right font-semibold">Self</th>
                    <th className="px-2 py-1 font-semibold">Coach</th>
                    <th className="px-2 py-1 font-semibold">Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {report.coach.map((c) => (
                    <tr key={c.playerId} className="border-t">
                      <td className="px-2 py-1 font-medium">{c.name}</td>
                      <td className="tnum px-2 py-1 text-right">{c.self ?? "-"}</td>
                      <td className="px-2 py-1">
                        <Select name={`rating__${c.playerId}`} defaultValue={c.coach ? String(c.coach) : ""} aria-label={`Coach rating for ${c.name}`} className="h-8 w-20">
                          <option value="">-</option>
                          {RATINGS.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input name={`comment__${c.playerId}`} maxLength={MAX_COMMENT} defaultValue={c.comment ?? ""} aria-label={`Comment for ${c.name}`} placeholder="One line they'll read" className="h-8" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <SubmitButton size="sm" variant="secondary" name="intent" value="save" pendingText="Saving…">
            Save
          </SubmitButton>
          <SubmitButton size="sm" name="intent" value="publish" pendingText="Publishing…">
            {event.reviewPublishedAt ? "Publish again" : "Publish report"}
          </SubmitButton>
        </div>
        <p className="text-xs text-muted-foreground">Publishing closes the vote and posts the report in the events channel.</p>
      </ActionForm>
    </section>
  );
}
