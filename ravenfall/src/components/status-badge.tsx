import type { ApplicationStatus, AttendanceStatus, EventType, MemberStatus } from "@prisma/client";
import { CalendarOff, Check, Clock, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type V = "default" | "accent" | "destructive" | "success" | "info" | "warning" | "outline";
type Icon = typeof Check;

// One mapping for every status in the app: success = good/done (Check),
// accent = pending/needs attention (Clock), destructive = bad (X),
// outline = neutral/inactive (Minus). Icons mean colour is never the only cue.
const MEMBER: Record<MemberStatus, [V, Icon]> = {
  ACTIVE: ["success", Check],
  CANDIDATE: ["accent", Clock],
  INACTIVE: ["outline", Minus],
  DISCHARGED: ["destructive", X],
};
const APP: Record<ApplicationStatus, [V, Icon]> = {
  PENDING: ["accent", Clock],
  APPROVED: ["success", Check],
  DENIED: ["destructive", X],
};
const ATT: Record<AttendanceStatus, [V, Icon]> = {
  ATTENDING: ["success", Check],
  ABSENT: ["outline", Minus],
  EXCUSED: ["accent", CalendarOff],
  NOSHOW: ["destructive", X],
};
const EVT: Record<EventType, V> = { OP: "destructive", TRAINING: "default", BRIEFING: "accent" };

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  ATTENDING: "Attending",
  ABSENT: "Absent",
  EXCUSED: "Excused",
  NOSHOW: "No-show",
};

function Status({ map, label }: { map: [V, Icon]; label: string }) {
  const [variant, Icon] = map;
  return (
    <Badge variant={variant}>
      <Icon aria-hidden /> {label}
    </Badge>
  );
}

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return <Status map={MEMBER[status]} label={status} />;
}
export function AppStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Status map={APP[status]} label={status} />;
}
export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  return <Status map={ATT[status]} label={ATTENDANCE_LABEL[status]} />;
}
export function EventTypeBadge({ type }: { type: EventType }) {
  return <Badge variant={EVT[type]}>{type === "OP" ? "Operation" : type}</Badge>;
}
