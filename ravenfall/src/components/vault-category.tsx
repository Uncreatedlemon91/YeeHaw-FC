import { BookOpen, Crosshair, Flag, HeartPulse, Plane, type LucideIcon } from "lucide-react";

// Qualification categories: icon, label and ribbon colours. The RIBBON map is
// copied from app/roster/[id]/page.tsx; roster should import it from here.
export const CATEGORIES = ["WEAPONS", "LEADERSHIP", "MEDICAL", "PILOT", "GENERAL"] as const;

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  WEAPONS: Crosshair,
  LEADERSHIP: Flag,
  MEDICAL: HeartPulse,
  PILOT: Plane,
  GENERAL: BookOpen,
};

export const RIBBON: Record<string, string> = {
  WEAPONS: "bg-[linear-gradient(90deg,#7a1f1f_0_30%,#c9a227_30%_40%,#7a1f1f_40%_60%,#c9a227_60%_70%,#7a1f1f_70%)]",
  LEADERSHIP: "bg-[linear-gradient(90deg,#1f3a7a_0_35%,#e5e5e5_35%_45%,#1f3a7a_45%_55%,#e5e5e5_55%_65%,#1f3a7a_65%)]",
  MEDICAL: "bg-[linear-gradient(90deg,#e5e5e5_0_40%,#a32020_40%_60%,#e5e5e5_60%)]",
  PILOT: "bg-[linear-gradient(90deg,#3b6fb5_0_25%,#c9a227_25%_35%,#3b6fb5_35%_65%,#c9a227_65%_75%,#3b6fb5_75%)]",
  GENERAL: "bg-[linear-gradient(90deg,#4f6b2f_0_40%,#d4b483_40%_60%,#4f6b2f_60%)]",
};

export const categoryLabel = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();

/** Thin ribbon strip in the category's colours. */
export function CategoryRibbon({ category, className = "" }: { category: string; className?: string }) {
  return <span aria-hidden className={`block h-1.5 w-full ${RIBBON[category] ?? RIBBON.GENERAL} ${className}`} />;
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICON[category] ?? BookOpen;
  return <Icon aria-hidden className={className} />;
}
