// Club identity and the fixed lists the site works from. Nothing here is
// secret, so it lives in code rather than .env. Ported from proclubs/config.py
// (SITE_*), roles.py (SQUAD_STATUSES), discord_roster.py (PITCH_POSITIONS),
// setpieces.py and recruitment.py.

import type { Attendance, ClubRole, EventType, ObjectiveKind, Position, ProspectStage, SignupStatus, SquadStatus, SuggestionStatus } from "@prisma/client";

export const CLUB = {
  // The club. Write it without "the": "Sign for YeeHaw FC".
  name: "YeeHaw FC",
  siteName: "YeeHaw FC",
  short: "YFC",
  tagline: "Pro Clubs",
  motto: "Earn the shirt. Play the system.",
  description:
    "A competitive EA FC Pro Clubs side that plays as a team: set positions, a real tactic, and a squad that turns up.",
  // Shown on the home page. Leave empty to hide the link.
  discordInvite: "https://discord.gg/J4d7D5kDX8",
};

export const SQUAD_STATUSES: readonly SquadStatus[] = ["STARTER", "ROTATION", "SUBSTITUTE"];

// The short form is for chips; the long form is how the club talks about it.
export const SQUAD_STATUS_LABEL: Record<SquadStatus, string> = {
  STARTER: "Starter",
  ROTATION: "Rotation",
  SUBSTITUTE: "Substitute",
};
export const SQUAD_STATUS_LONG: Record<SquadStatus, string> = {
  STARTER: "Starting Player",
  ROTATION: "Rotation Player",
  SUBSTITUTE: "Substitute Player",
};

export const POSITIONS: readonly Position[] = [
  "GOALKEEPER",
  "CENTRE_BACK",
  "FULL_BACK",
  "WING_BACK",
  "DEFENSIVE_MIDFIELD",
  "CENTRE_MIDFIELD",
  "ATTACKING_MIDFIELD",
  "WINGER",
  "STRIKER",
  "ANY_OUTFIELD",
];

export const POSITION_LABEL: Record<Position, string> = {
  GOALKEEPER: "Goalkeeper",
  CENTRE_BACK: "Centre Back",
  FULL_BACK: "Full Back",
  WING_BACK: "Wing Back",
  DEFENSIVE_MIDFIELD: "Defensive Midfield",
  CENTRE_MIDFIELD: "Centre Midfield",
  ATTACKING_MIDFIELD: "Attacking Midfield",
  WINGER: "Winger",
  STRIKER: "Striker",
  ANY_OUTFIELD: "Any Outfield",
};

export const CLUB_ROLE_LABEL: Record<ClubRole, string> = {
  PRESIDENT: "Club President",
  HEAD_COACH: "Head Coach",
  COACH: "Coach",
};

export const OBJECTIVE_LABEL: Record<ObjectiveKind, string> = {
  APPEARANCES: "Appearances",
  GOALS: "Goals",
  ASSISTS: "Assists",
  AVG_RATING: "Average rating",
  ATTENDANCE: "Attendance %",
  CLEAN_SHEETS: "Clean sheets",
  MOTM: "Man of the Match awards",
};

export const SHIRT_MIN = 1;
export const SHIRT_MAX = 99;

export const SET_PIECE_KINDS = ["Corner", "Free kick", "Penalty", "Throw-in", "Kick-off"] as const;
export const SET_PIECE_SIDES = ["Left", "Right", "Central", "Either"] as const;

export const PROSPECT_STAGE_LABEL: Record<ProspectStage, string> = {
  PROSPECT: "Prospect",
  TRIAL: "On trial",
  OFFERED: "Offered",
  SIGNED: "Signed",
  REJECTED: "Not for us",
};

// The settling-in checklist for a new signing. `auto` steps are read from
// the data; the rest are ticked by hand on the prospect's file.
export const ONBOARDING = [
  { key: "contract", label: "Contract started", auto: true },
  { key: "gamertag", label: "Gamertag linked", auto: true },
  { key: "ea_club", label: "Invited to the EA club in-game", auto: false },
  { key: "welcome", label: "Welcome message sent", auto: false },
  { key: "nights", label: "Usual nights set", auto: true },
] as const;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** "Centre Back" for a Position, "" for none. */
export function positionLabel(p: Position | null | undefined): string {
  return p ? POSITION_LABEL[p] : "";
}

export const EVENT_TYPES: readonly EventType[] = ["MATCH", "SCRIM", "TOURNAMENT", "COMMUNITY", "TRAINING", "THEORY"];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  MATCH: "Match",
  SCRIM: "Scrim",
  TOURNAMENT: "Tournament",
  COMMUNITY: "Community",
  TRAINING: "Training",
  THEORY: "Theory",
};

/** Fixtures that get a team sheet and a report; community nights and sessions don't. */
export const MATCH_TYPES: readonly EventType[] = ["MATCH", "SCRIM", "TOURNAMENT"];
/** Training and theory sessions carry a plan (objective, role briefs, review). */
export const SESSION_TYPES: readonly EventType[] = ["TRAINING", "THEORY"];

export const SIGNUP_LABEL: Record<SignupStatus, string> = { GOING: "Going", MAYBE: "Maybe", OUT: "Can't make it" };
export const ATTENDANCE_LABEL: Record<Attendance, string> = { PRESENT: "Present", ABSENT: "Absent", EXCUSED: "Excused" };

export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = {
  OPEN: "New",
  PLANNED: "Planned",
  DONE: "Worked on",
  DECLINED: "Not now",
};
