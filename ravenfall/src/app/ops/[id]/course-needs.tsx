import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { whoNeeds } from "@/lib/training";
import { inviteNeeds } from "../actions";

const WHY = { billet: "billet", promotion: "next rank", recertify: "recertify" } as const;

/** For instructors on a course: who needs it, who's invited, and a button to catch newcomers. */
export async function CourseNeeds({ event }: { event: { id: string; invitedUserIds: string[]; startTime: Date; course: { id: string; title: string } } }) {
  const needs = await whoNeeds(event.course.id);
  const users = await prisma.user.findMany({ where: { id: { in: needs.map((n) => n.userId) } }, select: { id: true, callsign: true, discordUsername: true } });
  const name = new Map(users.map((u) => [u.id, u.callsign ?? u.discordUsername]));
  const waiting = needs.filter((n) => !event.invitedUserIds.includes(n.userId));
  const upcoming = event.startTime > new Date();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="size-4 text-accent" aria-hidden /> Who needs {event.course.title}
        </CardTitle>
        <CardDescription>
          Members whose billet or next rank calls for it, or whose certification has lapsed. They&apos;re invited by name and DMed when the course is scheduled.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {needs.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {needs.map((n) => (
              <li key={n.userId} className="flex items-center justify-between gap-2">
                <Link href={`/roster/${n.userId}`} className="truncate hover:text-accent">
                  {name.get(n.userId)}
                </Link>
                <span className="shrink-0 text-micro uppercase text-muted-foreground">
                  {WHY[n.why]}
                  {event.invitedUserIds.includes(n.userId) ? " · invited" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody needs it right now.</p>
        )}
        {upcoming && waiting.length > 0 && (
          <ActionForm action={inviteNeeds} className="gap-2">
            <input type="hidden" name="id" value={event.id} />
            <SubmitButton size="sm" variant="outline" className="self-start" pendingText="Inviting…">
              Invite {waiting.length} more
            </SubmitButton>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}
