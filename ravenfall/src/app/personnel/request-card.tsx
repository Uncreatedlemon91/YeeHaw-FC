import type { PersonnelRequest, User } from "@prisma/client";
import { CalendarOff, IdCard, Shuffle, X } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge } from "@/components/ui/badge";
import { describe, REQUEST_LABEL } from "@/lib/personnel";
import { fmtDate } from "@/lib/time";
import { cancelRequest, endLeave } from "./actions";
import { DecideForm } from "./decide-form";

const ICON = { ROLE: Shuffle, CALLSIGN: IdCard, LOA: CalendarOff } as const;
const VARIANT = { PENDING: "accent", APPROVED: "success", DENIED: "destructive", CANCELLED: "outline" } as const;

type Req = PersonnelRequest & { user?: User; reviewedBy?: User | null };

/**
 * One request as a routing slip. `decidable` adds Approve / Deny,
 * `own` adds Withdraw (pending) or Back early (leave in progress), and
 * `showNotes` reveals the reason and review note to those cleared for them.
 */
export function RequestCard({
  r,
  decidable,
  own,
  showNotes,
  showMember,
}: {
  r: Req;
  decidable?: boolean;
  own?: boolean;
  showNotes?: boolean;
  showMember?: boolean;
}) {
  const Icon = ICON[r.type];
  const now = new Date();
  const onLeaveNow = r.type === "LOA" && r.status === "APPROVED" && r.startDate! <= now && r.endDate! >= now;
  return (
    <div className="rounded-md border bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-4 text-accent" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{REQUEST_LABEL[r.type]}</span>
              <Badge variant={VARIANT[r.status]}>{onLeaveNow ? "On leave" : r.status}</Badge>
            </div>
            {showMember && r.user && (
              <Link href={`/roster/${r.user.id}?tab=requests`} className="mt-1 flex items-center gap-2 text-sm hover:text-accent">
                <Avatar discordId={r.user.discordId} avatar={r.user.avatar} size={18} />
                {r.user.rank && <span className="text-muted-foreground">{r.user.rank}</span>}
                <span className="font-semibold">{r.user.callsign ?? r.user.discordUsername}</span>
                <span className="text-muted-foreground">{[r.user.squad, r.user.unitRole].filter(Boolean).join(" · ")}</span>
              </Link>
            )}
            <div className="typed mt-1 text-sm">{describe(r)}</div>
            {showNotes && r.reason && <p className="mt-1 text-sm text-muted-foreground">“{r.reason}”</p>}
            <div className="typed mt-1 text-[11px] uppercase text-muted-foreground">
              Filed {fmtDate(r.createdAt)}
              {r.decidedAt && r.status !== "CANCELLED" && (
                <> · Decided {fmtDate(r.decidedAt)}{r.reviewedBy && ` by ${r.reviewedBy.callsign ?? r.reviewedBy.discordUsername}`}</>
              )}
            </div>
            {showNotes && r.reviewNote && <p className="mt-1 border-l-2 border-accent pl-2 text-sm text-muted-foreground">{r.reviewNote}</p>}
          </div>
        </div>
        {own && r.status === "PENDING" && (
          <form action={cancelRequest}>
            <input type="hidden" name="requestId" value={r.id} />
            <ConfirmButton message="Withdraw this request?" variant="ghost" size="sm">
              <X /> Withdraw
            </ConfirmButton>
          </form>
        )}
        {own && onLeaveNow && (
          <form action={endLeave}>
            <input type="hidden" name="requestId" value={r.id} />
            <ConfirmButton message="End your leave today and return to duty?" variant="outline" size="sm">
              Back early
            </ConfirmButton>
          </form>
        )}
      </div>
      {decidable && <DecideForm requestId={r.id} pending={r.status === "PENDING"} />}
    </div>
  );
}
