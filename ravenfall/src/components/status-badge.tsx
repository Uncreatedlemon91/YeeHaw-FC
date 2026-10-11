import type { ApplicationStatus, AttendanceStatus, EventType, MemberStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

type V = "default" | "accent" | "destructive" | "success" | "outline";

const MEMBER: Record<MemberStatus, V> = { ACTIVE: "success", CANDIDATE: "accent", INACTIVE: "outline", DISCHARGED: "destructive" };
const APP: Record<ApplicationStatus, V> = { PENDING: "accent", APPROVED: "success", DENIED: "destructive" };
const ATT: Record<AttendanceStatus, V> = { ATTENDING: "success", ABSENT: "outline", EXCUSED: "accent", NOSHOW: "destructive" };
const EVT: Record<EventType, V> = { OP: "destructive", TRAINING: "default", BRIEFING: "accent" };

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  ATTENDING: "Attending",
  ABSENT: "Absent",
  EXCUSED: "Excused",
  NOSHOW: "No-show",
};

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return <Badge variant={MEMBER[status]}>{status}</Badge>;
}
export function AppStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge variant={APP[status]}>{status}</Badge>;
}
export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  return <Badge variant={ATT[status]}>{ATTENDANCE_LABEL[status]}</Badge>;
}
export function EventTypeBadge({ type }: { type: EventType }) {
  return <Badge variant={EVT[type]}>{type === "OP" ? "Operation" : type}</Badge>;
}
