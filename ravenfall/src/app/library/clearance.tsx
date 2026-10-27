import type { LibraryClearance } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { CLEARANCE_LABEL } from "@/lib/library";

const VARIANT = { PUBLIC: "success", UNIT: "outline", LEADERSHIP: "accent", COMMAND: "destructive" } as const;

export function ClearanceBadge({ clearance }: { clearance: LibraryClearance }) {
  return <Badge variant={VARIANT[clearance]}>{CLEARANCE_LABEL[clearance]}</Badge>;
}
