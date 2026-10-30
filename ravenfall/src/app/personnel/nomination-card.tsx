import type { Award, AwardNomination, Event, User } from "@prisma/client";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Ribbon } from "@/components/ribbon";
import { Badge } from "@/components/ui/badge";
import { callsignOf } from "@/lib/award-service";
import { stripesOf } from "@/lib/awards";
import { fmtDate } from "@/lib/time";
import { DecideNominationForm } from "./decide-nomination-form";

const VARIANT = { PENDING: "accent", APPROVED: "success", DENIED: "destructive" } as const;

export type NominationRow = AwardNomination & { award: Award; nominee: User; nominatedBy: User | null; decidedBy: User | null; event: Pick<Event, "id" | "title"> | null };

/** One nomination as a routing slip. `decidable` adds Approve / Deny; `blocked` says why it can't. */
export function NominationCard({ n, decidable, blocked }: { n: NominationRow; decidable?: boolean; blocked?: string }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="w-20 shrink-0 pt-0.5">
          <Ribbon stripes={stripesOf(n.award.ribbon)} device={n.award.device} label={`${n.award.name} ribbon`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/vault/${n.award.slug}`} className="font-semibold hover:text-accent">
              {n.award.name}
            </Link>
            <Badge variant={VARIANT[n.status]}>{n.status}</Badge>
          </div>
          <Link href={`/roster/${n.nomineeId}`} className="mt-1 flex items-center gap-2 text-sm hover:text-accent">
            <Avatar discordId={n.nominee.discordId} avatar={n.nominee.avatar} name={callsignOf(n.nominee)} size={18} />
            {n.nominee.rank && <span className="text-muted-foreground">{n.nominee.rank}</span>}
            <span className="font-semibold">{callsignOf(n.nominee)}</span>
            <span className="text-muted-foreground">{[n.nominee.squad, n.nominee.unitRole].filter(Boolean).join(" · ")}</span>
          </Link>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">“{n.citation}”</p>
          <div className="typed mt-1 text-micro uppercase text-muted-foreground">
            Nominated {fmtDate(n.createdAt)}
            {n.nominatedBy && ` by ${callsignOf(n.nominatedBy)}`}
            {n.event && (
              <>
                {" · "}
                <Link href={`/ops/${n.event.id}`} className="hover:text-accent">
                  {n.event.title}
                </Link>
              </>
            )}
            {n.decidedAt && (
              <>
                {" · "}
                {n.status === "APPROVED" ? "Approved" : "Denied"} {fmtDate(n.decidedAt)}
                {n.decidedBy && ` by ${callsignOf(n.decidedBy)}`}
              </>
            )}
          </div>
          {n.decisionNote && <p className="mt-1 border-l-2 border-accent pl-2 text-sm text-muted-foreground">{n.decisionNote}</p>}
        </div>
      </div>
      {decidable && n.status === "PENDING" && (blocked ? <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{blocked}</p> : <DecideNominationForm nominationId={n.id} />)}
    </div>
  );
}
