import type { ServiceRecordType } from "@prisma/client";
import { Award, BadgeCheck, Flag, Medal, MessageSquareWarning, ScrollText, ShieldAlert, Shuffle, UserPlus } from "lucide-react";

// Colours use the same semantic tokens as status-badge.tsx (success / accent /
// info / warning / destructive); neutral entries stay muted.
// Shared by the server page (entry type picker) and the client timeline, so
// it lives outside both: a "use client" module's exports reach the server
// only as references.
export const RECORD_STYLE: Record<ServiceRecordType, { icon: typeof Award; color: string; label: string }> = {
  ENLISTMENT: { icon: UserPlus, color: "text-success-fg", label: "Enlistment" },
  PROMOTION: { icon: Medal, color: "text-accent", label: "Promotion" },
  AWARD: { icon: Award, color: "text-accent", label: "Award" },
  QUALIFICATION: { icon: BadgeCheck, color: "text-info", label: "Qualification" },
  COUNSELING: { icon: MessageSquareWarning, color: "text-warning", label: "Counselling" },
  DISCIPLINARY: { icon: ShieldAlert, color: "text-destructive-fg", label: "Disciplinary" },
  TRANSFER: { icon: Shuffle, color: "text-foreground", label: "Transfer" },
  DISCHARGE: { icon: Flag, color: "text-muted-foreground", label: "Discharge" },
  NOTE: { icon: ScrollText, color: "text-muted-foreground", label: "Note" },
};
