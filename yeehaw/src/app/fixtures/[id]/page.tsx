import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { Countdown } from "@/components/countdown";
import { EventSheetEditor } from "@/components/event-sheet-editor";
import { PageHeader } from "@/components/page-header";
import { Bench, Pitch } from "@/components/pitch";
import { SlotSignup } from "@/components/slot-signup";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EVENT_TYPE_LABEL, MATCH_TYPES, SESSION_TYPES } from "@/config/club";
import { getSessionUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { loadEventPage } from "@/lib/event-page";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";
import { claimSlotAction, saveSheetAction } from "../actions";
import { AnswerCard, AttendanceCard, NoPosition, PlanCard, ReportCard, RosterColumns, StaffBar, UnansweredCard } from "./sections";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await prisma.event.findUnique({ where: { id }, select: { title: true } }).catch(() => null);
  return { title: e?.title ?? "Fixture" };
}

export default async function FixturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  const page = await loadEventPage(id, user);
  if (!page) notFound();
  const { event } = page;
  const member = hasPerm(user?.perms, "MEMBER");
  const canSign = member && event.signupsOpen && !page.over;
  const isMatch = MATCH_TYPES.includes(event.type);
  const isSession = SESSION_TYPES.includes(event.type);
  const discordUrl =
    env.guildId && event.discordChannelId && event.discordMessageId ? `https://discord.com/channels/${env.guildId}/${event.discordChannelId}/${event.discordMessageId}` : null;

  return (
    <Container>
      <PageHeader
        eyebrow={EVENT_TYPE_LABEL[event.type]}
        title={event.opponent ? `${event.title} vs ${event.opponent}` : event.title}
        description={
          <>
            {fmt(event.startsAt)} · <Countdown to={event.startsAt} />
          </>
        }
        actions={
          <>
            {event.formation && <Badge variant="outline">{event.formation}</Badge>}
            {!event.signupsOpen && <Badge variant="outline">Sign-ups closed</Badge>}
          </>
        }
      />
      {event.description && <p className="mb-6 max-w-3xl whitespace-pre-wrap text-sm">{event.description}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          {page.sheetPublished && !page.editor && (
            <Card>
              <CardHeader>
                <CardTitle>Team sheet</CardTitle>
                <CardDescription>Published by the coaches.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Pitch formation={event.formation!} slots={page.sheet} />
                <Bench formation={event.formation!} slots={page.sheet} hideEmpty />
              </CardContent>
            </Card>
          )}

          {event.formation ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Sign-ups</CardTitle>
                  <CardDescription>
                    {page.signups.filter((s) => s.slotKey).length} of {Object.keys(page.slots).length} positions taken.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SlotSignup formation={event.formation} slots={page.claimed} mySlot={page.mySlot} canSign={canSign} claim={claimSlotAction.bind(null, event.id)} />
                </CardContent>
              </Card>
              <NoPosition page={page} />
            </>
          ) : (
            <RosterColumns page={page} />
          )}

          {isSession && <PlanCard page={page} signedIn={!!user} />}
          {isMatch && <ReportCard page={page} />}
        </div>

        <div className="flex flex-col gap-6">
          <AnswerCard page={page} signedIn={!!user} member={member} />
          {page.isStaff && <StaffBar page={page} discordUrl={discordUrl} />}
          {!page.isStaff && discordUrl && member && (
            <a href={discordUrl} className="text-sm text-accent underline underline-offset-2" target="_blank" rel="noreferrer">
              Open the Discord post
            </a>
          )}
          {page.isStaff && <UnansweredCard page={page} />}
          {page.isStaff && <AttendanceCard page={page} />}
        </div>
      </div>

      {page.isStaff && page.editor && event.formation && (
        <section className="mt-10" aria-labelledby="sheet-h">
          <h2 id="sheet-h" className="mb-1 font-display text-xl font-bold uppercase">
            Team sheet
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {page.sheetPublished && event.lineupPublishedAt ? `Published ${fmt(event.lineupPublishedAt)}. Publishing again re-posts it; players are only DMed once.` : "Pick the XI and the bench. Everyone who answered is at the top of the list. Players see it once you publish."}
          </p>
          <EventSheetEditor eventId={event.id} formation={event.formation} initialSlots={page.editor.initial} roster={page.editor.roster} save={saveSheetAction} />
        </section>
      )}
    </Container>
  );
}
