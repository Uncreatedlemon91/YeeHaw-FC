import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { TermsFields } from "@/components/contract-fields";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { ProspectFields } from "@/components/prospect-fields";
import { ContractBadge, StageBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { MATCH_TYPES } from "@/config/club";
import { getSessionUser, requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { onboardingFor, positionsText } from "@/lib/recruitment";
import { averageRating, MANUAL_STAGES, MAX_NOTE } from "@/lib/recruitment-rules";
import { fmt } from "@/lib/time";
import { deleteProspectAction, noteAction, offerAction, stageAction, tickAction, updateProspectAction, welcomeAction } from "../actions";

export const metadata = { title: "Prospect" };
export const dynamic = "force-dynamic";

const asAct = (a: unknown) => a as (p: ActionState, d: FormData) => Promise<ActionState>;

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser("STAFF", `/staff/recruitment/${id}`);
  const user = (await getSessionUser())!;
  const isManagement = hasPerm(user.perms, "MANAGEMENT");
  const p = await prisma.prospect.findUnique({ where: { id }, include: { notes: { orderBy: { createdAt: "desc" }, include: { event: { select: { id: true, title: true, startsAt: true } } } }, player: true } });
  if (!p) notFound();

  const since = new Date(Date.now() - 60 * 86_400_000);
  const [seasons, matches, onboarding, contracts] = await Promise.all([
    prisma.season.findMany({ where: { state: { in: ["WINDOW", "ACTIVE"] } }, orderBy: { startsAt: "asc" } }),
    prisma.event.findMany({ where: { type: { in: [...MATCH_TYPES] }, startsAt: { gte: since, lte: new Date() } }, orderBy: { startsAt: "desc" }, select: { id: true, title: true, startsAt: true } }),
    onboardingFor(p),
    p.playerId ? prisma.contract.findMany({ where: { playerId: p.playerId, state: { in: ["OFFERED", "ACTIVE", "DECLINED"] } }, include: { season: true }, orderBy: { season: { startsAt: "desc" } }, take: 3 }) : [],
  ]);
  const avg = averageRating(p.notes.map((n) => n.rating));
  const canMove = p.stage !== "SIGNED";
  // Offers go to the season that is open for them: the window if there is one, else the running season.
  const offerSeason = seasons.find((s) => s.state === "WINDOW") ?? seasons[0];

  return (
    <Container>
      <PageHeader
        eyebrow="Staff · Recruitment"
        title={p.name}
        description={[positionsText(p), p.gamertag, p.source && `from ${p.source}`].filter(Boolean).join(" · ") || undefined}
        actions={<StageBadge stage={p.stage} />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Trial notes{avg != null ? ` · average ${avg}/10` : ""}</CardTitle>
              <CardDescription>Write one after each session they play. Each is copied to the recruitment channel, and a note from a match puts a prospect on trial.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <ActionForm action={asAct(noteAction)}>
                <input type="hidden" name="id" value={p.id} />
                <Field label="Note" htmlFor="body">
                  <Textarea id="body" name="body" rows={3} maxLength={MAX_NOTE} required placeholder="How did they play? Positioning, communication, fit." />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Rating (1 to 10, optional)" htmlFor="rating">
                    <Input id="rating" name="rating" type="number" min={1} max={10} inputMode="numeric" />
                  </Field>
                  <Field label="From match (optional)" htmlFor="eventId">
                    <Select id="eventId" name="eventId" defaultValue="">
                      <option value="">General</option>
                      {matches.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title} · {fmt(m.startsAt, "d MMM")}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div>
                  <SubmitButton pendingText="Saving…">Save note</SubmitButton>
                </div>
              </ActionForm>
              {p.notes.length > 0 && (
                <ul className="divide-y border-t">
                  {p.notes.map((n) => (
                    <li key={n.id} className="flex flex-col gap-1 py-3 text-sm">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {n.rating != null && <Badge variant={n.rating >= 7 ? "success" : n.rating >= 5 ? "accent" : "destructive"}>{n.rating}/10</Badge>}
                        {n.authorName} · {fmt(n.createdAt, "d MMM yyyy")}
                        {n.event && (
                          <Link href={`/fixtures/${n.event.id}`} className="text-accent underline underline-offset-2">
                            {n.event.title}
                          </Link>
                        )}
                      </p>
                      <p className="whitespace-pre-wrap">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {p.stage === "SIGNED" && (
            <Card>
              <CardHeader>
                <CardTitle>Settling in ({onboarding.done}/{onboarding.total})</CardTitle>
                <CardDescription>Some steps are worked out from the data; the rest you tick.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ul className="divide-y text-sm">
                  {onboarding.steps.map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex items-center gap-2">
                        {s.done ? <Check aria-hidden className="size-4 text-success-fg" /> : <Circle aria-hidden className="size-4 text-muted-foreground" />}
                        <span className={s.done ? "" : "text-muted-foreground"}>{s.label}</span>
                        <span className="sr-only">{s.done ? "(done)" : "(not done)"}</span>
                      </span>
                      {s.auto ? (
                        <span className="text-xs text-muted-foreground">Automatic</span>
                      ) : (
                        <ActionForm action={asAct(tickAction)} className="gap-0">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="step" value={s.key} />
                          <input type="hidden" name="done" value={s.done ? "0" : "1"} />
                          <SubmitButton size="sm" variant="ghost" pendingText="…">
                            {s.done ? "Untick" : "Tick"}
                          </SubmitButton>
                        </ActionForm>
                      )}
                    </li>
                  ))}
                </ul>
                <ActionForm action={asAct(welcomeAction)} className="gap-0">
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton variant="secondary" size="sm" className="self-start" pendingText="Sending…">
                    DM the welcome message
                  </SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={asAct(updateProspectAction.bind(null, p.id))}>
                <ProspectFields defaults={p} />
                <div>
                  <SubmitButton variant="secondary" pendingText="Saving…">
                    Save details
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Stage</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {canMove ? (
                <ActionForm action={asAct(stageAction)} className="gap-3">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="flex flex-wrap gap-2">
                    {MANUAL_STAGES.filter((s) => s !== p.stage).map((s) => (
                      <SubmitButton key={s} name="stage" value={s} size="sm" variant="outline" pendingText="…">
                        {{ PROSPECT: "Back to prospect", TRIAL: "Put on trial", REJECTED: "Not for us" }[s as "PROSPECT"]}
                      </SubmitButton>
                    ))}
                  </div>
                </ActionForm>
              ) : (
                <p className="text-muted-foreground">Signed. Manage them from their player page.</p>
              )}
              <p className="text-xs text-muted-foreground">Offered and Signed follow the contract: offering moves the file to Offered, and the player accepting signs it.</p>
              {p.player && (
                <Link href={`/players/${p.player.slug}`} className="text-accent underline underline-offset-2">
                  Open {p.player.displayName}&apos;s player page
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contract</CardTitle>
              <CardDescription>An offer for the current or next season, sent to them in Discord with Accept and Decline buttons.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              {contracts.map((c) => (
                <p key={c.id} className="flex items-center gap-2">
                  <ContractBadge state={c.state} /> {c.season.name}
                  {c.shirtNumber != null && ` · #${c.shirtNumber}`}
                </p>
              ))}
              {p.stage === "SIGNED" ? null : !isManagement ? (
                <p className="text-muted-foreground">Management send the offer. Recommend them in the notes and ask.</p>
              ) : !offerSeason ? (
                <p className="text-muted-foreground">No season has an open window or is running. Open one under Admin, Seasons &amp; contracts.</p>
              ) : (
                <ActionForm action={asAct(offerAction)}>
                  <input type="hidden" name="id" value={p.id} />
                  <Field label="Season" htmlFor="seasonId">
                    <Select id="seasonId" name="seasonId" defaultValue={offerSeason.id}>
                      {seasons.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.state === "WINDOW" ? "next, window open" : "running"})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <TermsFields defaults={{ position: p.position, secondaryPosition: p.secondaryPosition, squadStatus: "ROTATION" }} />
                  <SubmitButton className="self-start" pendingText="Sending…">
                    Offer contract
                  </SubmitButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>

          <ActionForm action={asAct(deleteProspectAction)} className="gap-0">
            <input type="hidden" name="id" value={p.id} />
            <ConfirmButton variant="outline" size="sm" message="Delete this file and its notes?">
              Delete this file
            </ConfirmButton>
          </ActionForm>
        </div>
      </div>
    </Container>
  );
}
