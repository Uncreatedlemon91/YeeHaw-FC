import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { APPLICANT_STAGES, isCold, NEXT_ACTION, RECRUIT_STAGES, recruitProgress, STAGE_LABEL, type Stage } from "@/lib/recruit-pipeline";
import { answersOf } from "@/lib/recruitment";
import { fmt } from "@/lib/time";
import { cn } from "@/lib/utils";

const DAY = 864e5;
const ago = (d: Date, now: Date) => {
  const days = Math.floor((now.getTime() - d.getTime()) / DAY);
  return days < 1 ? "today" : `${days}d`;
};

type CardItem = { key: string; href: string; name: string; discordId: string; avatar: string | null; sub: string; since: Date; cold: boolean; mine?: boolean };

/** The Recruitment page's Pipeline tab: a funnel and two boards, applicants and Recruits. */
export async function PipelineBoard({ meId }: { meId: string }) {
  const now = new Date();
  const since = new Date(now.getTime() - 90 * DAY);
  const [pending, recent, recruits] = await Promise.all([
    prisma.recruitmentApplication.findMany({ where: { status: "PENDING" }, include: { user: true, recruiter: true }, orderBy: { createdAt: "asc" } }),
    prisma.recruitmentApplication.findMany({ where: { createdAt: { gte: since } }, select: { status: true, userId: true } }),
    recruitProgress({}, now),
  ]);
  const recruitUsers = await prisma.user.findMany({ where: { id: { in: recruits.map((r) => r.userId) } } });
  const userOf = new Map(recruitUsers.map((u) => [u.id, u]));

  // The funnel: applications in the last 90 days and how far those people got.
  const approvedIds = [...new Set(recent.filter((a) => a.status === "APPROVED").map((a) => a.userId))];
  const progressed = approvedIds.length ? await recruitProgress({ userIds: approvedIds }, now) : [];
  const funnel = [
    { label: "Applied", n: recent.length },
    { label: "Enlisted", n: approvedIds.length },
    { label: "Trained", n: progressed.filter((p) => p.trainedAt).length },
    { label: "First op", n: progressed.filter((p) => p.firstOpAt).length },
  ];

  const applicantCols = APPLICANT_STAGES.map((stage) => ({
    stage: stage as Stage,
    hint: NEXT_ACTION[stage],
    items: pending
      .filter((a) => a.stage === stage)
      .map(
        (a): CardItem => ({
          key: a.id,
          href: `/recruitment/${a.id}`,
          name: String(answersOf(a).callsign ?? a.discordUsername),
          discordId: a.discordId,
          avatar: a.user.avatar,
          sub: [
            a.recruiter ? (a.recruiter.callsign ?? a.recruiter.discordUsername) : "unclaimed",
            stage === "INTERVIEW_SET" && a.interviewAt ? fmt(a.interviewAt, "EEE d MMM HH:mm") : null,
          ]
            .filter(Boolean)
            .join(" · "),
          since: a.stageAt,
          cold: isCold(a.stage, a.stageAt, now, a.interviewAt),
          mine: a.recruiterId === meId,
        }),
      ),
  }));
  const RECRUIT_HINT: Record<(typeof RECRUIT_STAGES)[number], string> = {
    ENLISTED: "Get them to a recruit night",
    BOOKED: "Signed up; run the training",
    TRAINED: "Get them on an op",
    DEPLOYED: "Ready for Private",
  };
  const recruitCols = RECRUIT_STAGES.map((stage) => ({
    stage: stage as Stage,
    hint: RECRUIT_HINT[stage],
    items: recruits
      .filter((r) => r.stage === stage)
      .flatMap((r): CardItem[] => {
        const u = userOf.get(r.userId);
        if (!u) return [];
        return [
          {
            key: r.userId,
            href: `/roster/${r.userId}`,
            name: u.callsign ?? u.discordUsername,
            discordId: u.discordId,
            avatar: u.avatar,
            sub: r.booked ? `${r.booked.title} · ${fmt(r.booked.startTime, "EEE d MMM")}` : u.squad ?? "unassigned",
            since: r.since,
            cold: stage !== "DEPLOYED" && isCold(stage, r.since, now),
          },
        ];
      }),
  }));

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Last 90 days" className="jacket rounded-lg border p-4">
        <div className="field-label mb-3">Last 90 days</div>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {funnel.map((f, i) => (
            <li key={f.label} className="flex flex-col">
              <span className="font-display text-3xl font-bold leading-none">{f.n}</span>
              <span className="mt-1 text-micro uppercase tracking-wider text-muted-foreground">
                {f.label}
                {i > 0 && funnel[i - 1].n > 0 && ` · ${Math.round((f.n / funnel[i - 1].n) * 100)}%`}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <Board title="Applicants" description="Pending applications by stage. Move them along from the application." cols={applicantCols} now={now} />
      <Board
        title="Recruits"
        description="Enlisted members still at Recruit, by how far they've got: signed up for a recruit night or training, holding basic training, and their first op."
        cols={recruitCols}
        now={now}
      />
    </div>
  );
}

function Board({ title, description, cols, now }: { title: string; description: string; cols: { stage: Stage; hint: string; items: CardItem[] }[]; now: Date }) {
  return (
    <section aria-labelledby={`board-${title}`}>
      <h2 id={`board-${title}`} className="text-lg font-bold uppercase">
        {title}
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">{description}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cols.map((c) => (
          <Card key={c.stage} className="flex flex-col gap-2 p-3">
            <div className="flex items-baseline justify-between gap-2 border-b pb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider">{STAGE_LABEL[c.stage]}</span>
              <span className="typed text-xs text-muted-foreground">{c.items.length}</span>
            </div>
            <p className="text-micro text-muted-foreground">{c.hint}</p>
            <ul className="flex flex-col gap-1.5">
              {c.items.map((i) => (
                <li key={i.key}>
                  <Link
                    href={i.href}
                    className={cn("flex items-center gap-2 rounded-md border p-2 text-sm hover:border-accent/50", i.cold && "border-warning/50 bg-warning/5")}
                  >
                    <Avatar discordId={i.discordId} avatar={i.avatar} name={i.name} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {i.name}
                        {i.mine && <span className="ml-1.5 text-micro font-normal uppercase text-accent">mine</span>}
                      </span>
                      <span className="block truncate text-micro text-muted-foreground">{i.sub}</span>
                    </span>
                    {i.cold ? <Badge variant="warning">{ago(i.since, now)}</Badge> : <span className="text-micro text-muted-foreground">{ago(i.since, now)}</span>}
                  </Link>
                </li>
              ))}
              {!c.items.length && <li className="py-2 text-center text-xs text-muted-foreground">Nobody</li>}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}
