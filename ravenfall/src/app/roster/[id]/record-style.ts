import type { ServiceRecordType } from "@prisma/client";
import { RANKS } from "@/config/unit";
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

// Dot / connector tint per type for the timeline (additive; same tokens as above).
export const RECORD_DOT: Record<ServiceRecordType, string> = {
  ENLISTMENT: "text-success-fg",
  PROMOTION: "text-accent",
  AWARD: "text-accent",
  QUALIFICATION: "text-info",
  COUNSELING: "text-warning",
  DISCIPLINARY: "text-destructive-fg",
  TRANSFER: "text-foreground",
  DISCHARGE: "text-muted-foreground",
  NOTE: "text-muted-foreground",
};

/** Reads the ranks out of an automatic promotion entry ("Promoted to Sergeant" / "From Corporal."). */
export function promotionRanks(title: string, description: string | null): { from: string | null; to: string | null } {
  const find = (text: string | null | undefined, re: RegExp) => {
    const name = text?.match(re)?.[1]?.trim().replace(/\.$/, "");
    return RANKS.find((r) => r.name.toLowerCase() === name?.toLowerCase())?.abbr ?? null;
  };
  return { to: find(title, /^Promoted to (.+)$/i), from: find(description, /^From (.+?)\.?$/i) };
}
