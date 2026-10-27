import type { Attendance, ContractState, ProspectStage, SeasonState, SignupStatus, SquadStatus } from "@prisma/client";
import { Check, CircleHelp, Clock, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SQUAD_STATUS_LABEL } from "@/config/club";

type V = "default" | "accent" | "destructive" | "success" | "info" | "warning" | "outline";
type Icon = typeof Check;

// One mapping for every status in the app: success = good/done (Check),
// accent = pending/needs attention (Clock), destructive = bad (X),
// outline = neutral/inactive (Minus). Icons mean colour is never the only cue.
const CONTRACT: Record<ContractState, [V, Icon, string]> = {
  OFFERED: ["accent", Clock, "Offered"],
  ACTIVE: ["success", Check, "Active"],
  DECLINED: ["destructive", X, "Declined"],
  RELEASED: ["outline", Minus, "Released"],
  ENDED: ["outline", Minus, "Ended"],
};
const SEASON: Record<SeasonState, [V, Icon, string]> = {
  DRAFT: ["outline", Minus, "Draft"],
  WINDOW: ["accent", Clock, "Re-signing window"],
  ACTIVE: ["success", Check, "Active"],
  ENDED: ["outline", Minus, "Ended"],
};
const SIGNUP: Record<SignupStatus, [V, Icon, string]> = {
  GOING: ["success", Check, "Going"],
  MAYBE: ["accent", CircleHelp, "Maybe"],
  OUT: ["outline", X, "Can't make it"],
};
const ATTENDANCE: Record<Attendance, [V, Icon, string]> = {
  PRESENT: ["success", Check, "Present"],
  ABSENT: ["destructive", X, "Absent"],
  EXCUSED: ["accent", Minus, "Excused"],
};
const STAGE: Record<ProspectStage, [V, Icon, string]> = {
  PROSPECT: ["outline", Minus, "Prospect"],
  TRIAL: ["info", Clock, "On trial"],
  OFFERED: ["accent", Clock, "Offered"],
  SIGNED: ["success", Check, "Signed"],
  REJECTED: ["destructive", X, "Not for us"],
};
const SQUAD_V: Record<SquadStatus, V> = { STARTER: "default", ROTATION: "info", SUBSTITUTE: "outline" };

function Status({ map }: { map: [V, Icon, string] }) {
  const [variant, Icon, label] = map;
  return (
    <Badge variant={variant}>
      <Icon aria-hidden /> {label}
    </Badge>
  );
}

export const ContractBadge = ({ state }: { state: ContractState }) => <Status map={CONTRACT[state]} />;
export const SeasonBadge = ({ state }: { state: SeasonState }) => <Status map={SEASON[state]} />;
export const SignupBadge = ({ status }: { status: SignupStatus }) => <Status map={SIGNUP[status]} />;
export const AttendanceBadge = ({ status }: { status: Attendance }) => <Status map={ATTENDANCE[status]} />;
export const StageBadge = ({ stage }: { stage: ProspectStage }) => <Status map={STAGE[stage]} />;
export const SquadStatusBadge = ({ status }: { status: SquadStatus }) => (
  <Badge variant={SQUAD_V[status]}>{SQUAD_STATUS_LABEL[status]}</Badge>
);
