// Unit identity and structure. Edit these to suit the unit; nothing here is
// secret, so it lives in code rather than .env.

export const UNIT = {
  // The community. Write it without "the": "Enlist with Ravenfall PMC".
  name: "Ravenfall PMC",
  org: "Ravenfall PMC",
  siteName: "Ravenfall HQ",
  motto: "Loyal to the contract. Lethal to the rest.",
  description:
    "A tactical milsim unit running weekly combined-arms operations with a focus on realism, communication and teamwork.",
  // Shown on the landing page. Leave empty to hide the link.
  discordInvite: "",
  // YouTube video IDs for the landing page's media section (the part after
  // "v=" in a watch URL). Empty hides the section.
  media: [] as string[],
};

// The landing page's doctrine section.
export const DOCTRINE = [
  { title: "Communication", body: "Clear, brief, accurate radio discipline. Every operator knows the plan, their task and who they report to." },
  { title: "Fire & Manoeuvre", body: "Fireteams move under covering fire, bound by bound. Nobody moves alone and nobody fights alone." },
  { title: "Accountability", body: "Rank is earned through attendance, qualification and leadership. Every op ends in a debrief." },
];

// Highest last. `abbr` is the rank's key: it's stored on each member and in
// the Admin page's role mapping, so renaming one needs a data migration (see
// prisma/migrations/*_command_ranks). `short` is what goes in front of the
// member's name on Discord: "Pvt Viper".
// `requires` is what it takes to be promoted *into* that rank: events
// attended (in total), days in the PMC (since enlistment), days held at the
// rank below, qualification slugs from the vault, and whether leadership has
// to sign off. `typical` is the usual time in the PMC by then, for guidance.
// The personnel file shows it as a checklist; Command still promotes by hand.
//
// The pattern: each NCO step adds ~10 events and 15 days in grade, with
// leadership approval from Sergeant up. Officer ranks carry the same steps
// on, and the time between them keeps growing.
export type RankDef = {
  abbr: string;
  short: string;
  name: string;
  grade: string;
  tier: "enlisted" | "nco" | "officer";
  requires?: { ops?: number; service?: number; days?: number; quals?: string[]; approval?: boolean };
  typical?: string;
};

export const RANKS: readonly RankDef[] = [
  { abbr: "RCT", short: "Rct", name: "Recruit", grade: "E-1", tier: "enlisted" },
  { abbr: "PVT", short: "Pvt", name: "Private", grade: "E-2", tier: "enlisted", requires: { ops: 1, service: 7 }, typical: "1 week" },
  { abbr: "PFC", short: "Pfc", name: "Private First Class", grade: "E-3", tier: "enlisted", requires: { ops: 3, service: 14 }, typical: "2 weeks" },
  { abbr: "SPC", short: "Spc", name: "Specialist", grade: "E-4", tier: "enlisted", requires: { ops: 6, service: 30 } },
  { abbr: "CPL", short: "Cpl", name: "Corporal", grade: "E-4", tier: "nco", requires: { ops: 12, service: 45 } },
  { abbr: "SGT", short: "Sgt", name: "Sergeant", grade: "E-5", tier: "nco", requires: { ops: 20, days: 30, approval: true }, typical: "10–12 weeks" },
  { abbr: "SSG", short: "SSgt", name: "Staff Sergeant", grade: "E-6", tier: "nco", requires: { ops: 30, days: 45, approval: true }, typical: "4–5 months" },
  { abbr: "SFC", short: "SFC", name: "Sergeant First Class", grade: "E-7", tier: "nco", requires: { ops: 40, days: 60, approval: true }, typical: "6–8 months" },
  { abbr: "2LT", short: "2Lt", name: "Second Lieutenant", grade: "O-1", tier: "officer", requires: { ops: 50, days: 75, approval: true }, typical: "9–11 months" },
  { abbr: "1LT", short: "1Lt", name: "First Lieutenant", grade: "O-2", tier: "officer", requires: { ops: 60, days: 90, approval: true }, typical: "12–14 months" },
  { abbr: "DCDR", short: "DCdr", name: "Deputy Commander", grade: "O-3", tier: "officer", requires: { ops: 75, days: 105, approval: true }, typical: "16–18 months" },
  { abbr: "CDR", short: "Cdr", name: "Commander", grade: "O-4", tier: "officer", requires: { ops: 90, days: 120, approval: true }, typical: "20–24 months" },
];

export const RECRUIT_RANK = RANKS[0].abbr;

// Billets are slot caps per role: an ORBAT entry, not a suggestion. A role
// a squad doesn't list can't be held in that squad.
export type SquadDef = { name: string; callsign: string; blurb: string; billets: Record<string, number> };

export const SQUADS: readonly SquadDef[] = [
  {
    name: "Command",
    callsign: "Raven",
    blurb: "Mission planning, coordination and unit leadership.",
    billets: { Command: 3, "Radio Operator": 1 },
  },
  {
    name: "Alpha",
    callsign: "Wardog 1",
    blurb: "Line infantry. Assault, clearance and holding ground.",
    billets: { "Squad Leader": 1, "Team Leader": 2, "Radio Operator": 1, "Combat Medic": 1, "Automatic Rifleman": 2, Grenadier: 2, Rifleman: 4 },
  },
  {
    name: "Bravo",
    callsign: "Wardog 2",
    blurb: "Line infantry. Fire support and manoeuvre element.",
    billets: { "Squad Leader": 1, "Team Leader": 2, "Radio Operator": 1, "Combat Medic": 1, "Automatic Rifleman": 2, Grenadier: 2, Rifleman: 4 },
  },
  {
    name: "Charlie",
    callsign: "Shadow",
    blurb: "Reconnaissance, marksmen and forward observers.",
    billets: { "Squad Leader": 1, "Team Leader": 1, "Radio Operator": 1, Marksman: 4, Rifleman: 2 },
  },
  {
    name: "Reaper",
    callsign: "Reaper",
    blurb: "Rotary-wing transport, CAS and medevac.",
    billets: { "Squad Leader": 1, Pilot: 4 },
  },
  {
    name: "Medical",
    callsign: "Lifeline",
    blurb: "Combat medics and casualty evacuation.",
    billets: { "Team Leader": 1, "Combat Medic": 4 },
  },
];

// Roles (MOS). `requires` lists vault qualification slugs the member must
// hold to request it as primary or secondary. `leads` marks billets whose
// holders act as leadership for their own squad: they see its restricted
// files and decide its role and leave requests.
// `about` is optional longer copy for the public About > Billets page.
export type RoleDef = { name: string; code: string; blurb: string; requires: string[]; leads?: boolean; about?: string };

export const ROLES: readonly RoleDef[] = [
  { name: "Rifleman", code: "11B", blurb: "The backbone of the fireteam.", requires: ["basic-combat-training"], about: "You are the core of the fireteam: you move with your team, follow your team leader and learn the unit's drills by doing them." },
  { name: "Automatic Rifleman", code: "11B-AR", blurb: "Suppressive fire with the team's LMG.", requires: ["basic-combat-training"], about: "You carry the team's LMG and put down the suppressive fire that lets the rest of the fireteam manoeuvre." },
  { name: "Grenadier", code: "11B-GR", blurb: "Indirect fire and smoke with the UGL.", requires: ["basic-combat-training"], about: "You work the UGL, dropping indirect fire and smoke where the team needs it." },
  { name: "Marksman", code: "11B-DM", blurb: "Precision fire at extended range.", requires: ["basic-combat-training", "marksman"], about: "You engage at extended range and give the element eyes on the ground." },
  { name: "Combat Medic", code: "68W", blurb: "Casualty care under fire.", requires: ["basic-combat-training", "combat-lifesaver"], about: "You keep operators in the fight and get the wounded out." },
  { name: "Radio Operator", code: "25C", blurb: "Keeps the element on the net.", requires: ["basic-combat-training"], about: "You keep your element on the net and relay between it and the rest of the unit." },
  { name: "Team Leader", code: "11B-TL", blurb: "Leads a fireteam of four.", requires: ["basic-combat-training", "team-leader-course"], leads: true, about: "You lead a fireteam of four: you run the team in contact and answer to your squad leader. As a leadership billet it also gives you a say in your squad's role and leave requests." },
  { name: "Squad Leader", code: "11B-SL", blurb: "Leads the squad and its teams.", requires: ["basic-combat-training", "team-leader-course"], leads: true, about: "You lead the squad and its teams, turning Command's plan into orders. As a leadership billet it also gives you a say in your squad's role and leave requests." },
  { name: "Pilot", code: "153A", blurb: "Rotary-wing aviator.", requires: ["rotary-wing-pilot"], about: "You fly the unit's rotary-wing transport, CAS and medevac." },
  { name: "Command", code: "HQ", blurb: "Unit command staff.", requires: ["team-leader-course"], leads: true, about: "You sit on the unit's command staff, planning missions and leading the unit. As a leadership billet it also gives you a say in role and leave requests." },
];

export const UNIT_ROLES = ROLES.map((r) => r.name);
export const MAX_SECONDARY_ROLES = 2;

export function roleDef(name: string | null | undefined): RoleDef | undefined {
  return ROLES.find((r) => r.name === name);
}

export function squadDef(name: string | null | undefined): SquadDef | undefined {
  return SQUADS.find((s) => s.name === name);
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function rankIndex(abbr: string | null | undefined): number {
  return RANKS.findIndex((r) => r.abbr === abbr);
}

export function rankName(abbr: string | null | undefined): string {
  return RANKS.find((r) => r.abbr === abbr)?.name ?? abbr ?? "Unranked";
}

export function rankShort(abbr: string | null | undefined): string | null {
  return RANKS.find((r) => r.abbr === abbr)?.short ?? null;
}

/** The member's Discord nickname: "Pvt Viper". Discord caps it at 32. */
export function nickname(rank: string | null | undefined, name: string): string {
  const short = rankShort(rank);
  return (short ? `${short} ${name}` : name).slice(0, 32);
}

/**
 * A nickname with any rank prefix taken off: "Pvt Viper", "[PVT] Viper"
 * (the older format) and "Viper" all give "Viper".
 */
export function stripRank(nick: string | null | undefined): string {
  let n = (nick ?? "").trim().replace(/^\[[^\]]*\]\s*/, "");
  for (const r of RANKS) {
    for (const p of [r.short, r.abbr]) {
      if (n.toLowerCase().startsWith(`${p.toLowerCase()} `)) return n.slice(p.length + 1).trim();
    }
  }
  return n;
}

// The /apply questionnaire. Each answer is stored under its key in
// RecruitmentApplication.answers, so renaming a key orphans old answers.
export const APPLICATION_QUESTIONS = [
  { key: "callsign", label: "Preferred callsign", type: "text", required: true, max: 24,
    help: "Letters, numbers, spaces and hyphens. Command may assign a different one." },
  { key: "age", label: "Age", type: "number", required: true },
  { key: "timezone", label: "Timezone", type: "text", required: true, max: 60, help: "e.g. US Eastern, GMT+1" },
  { key: "availability", label: "Which days and times can you usually make?", type: "textarea", required: true, max: 1000 },
  { key: "experience", label: "Milsim / tactical shooter experience", type: "textarea", required: true, max: 2000,
    help: "Previous units, games, roles you've played." },
  { key: "interest", label: "What role would you like to fill?", type: "text", required: false, max: 120 },
  { key: "why", label: "Why do you want to join Ravenfall PMC?", type: "textarea", required: true, max: 2000 },
  { key: "referral", label: "How did you find us?", type: "text", required: false, max: 200 },
] as const;

export type QuestionKey = (typeof APPLICATION_QUESTIONS)[number]["key"];
