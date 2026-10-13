import type { ServiceRecordType } from "@prisma/client";
import { Award, BadgeCheck, Flag, Medal, MessageSquareWarning, ScrollText, ShieldAlert, Shuffle, UserPlus } from "lucide-react";

// Shared by the server page (entry type picker) and the client timeline, so
// it lives outside both: a "use client" module's exports reach the server
// only as references.
export const RECORD_STYLE: Record<ServiceRecordType, { icon: typeof Award; color: string; label: string }> = {
  ENLISTMENT: { icon: UserPlus, color: "text-green-400", label: "Enlistment" },
  PROMOTION: { icon: Medal, color: "text-accent", label: "Promotion" },
  AWARD: { icon: Award, color: "text-accent", label: "Award" },
  QUALIFICATION: { icon: BadgeCheck, color: "text-sky-400", label: "Qualification" },
  COUNSELING: { icon: MessageSquareWarning, color: "text-orange-300", label: "Counselling" },
  DISCIPLINARY: { icon: ShieldAlert, color: "text-red-400", label: "Disciplinary" },
  TRANSFER: { icon: Shuffle, color: "text-violet-400", label: "Transfer" },
  DISCHARGE: { icon: Flag, color: "text-muted-foreground", label: "Discharge" },
  NOTE: { icon: ScrollText, color: "text-muted-foreground", label: "Note" },
};
