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
  discordInvite: "https://discord.gg/hMKgjZFRdf",
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
// to sign off. `requiredReading: true` also asks that every library document
// required of the member has been acknowledged (shown only while something is
// required; it's set on the first step into each tier, add it to any rank).
// `typical` is the usual time in the PMC by then, for guidance.
// The personnel file shows it as a checklist; Command still promotes by hand.
//
// Paced for a long-term unit attending about one event a week: Corporal
// takes around six months, Staff Sergeant a year and Commander three years
// or more. Every rank from Private First Class up also needs time at the
// rank below, and every NCO and officer rank needs leadership approval.
export type RankDef = {
  abbr: string;
  short: string;
  name: string;
  grade: string;
  tier: "enlisted" | "nco" | "officer";
  requires?: { ops?: number; service?: number; days?: number; quals?: string[]; approval?: boolean; requiredReading?: boolean };
  typical?: string;
};

export const RANKS: readonly RankDef[] = [
  { abbr: "RCT", short: "Rct", name: "Recruit", grade: "E-1", tier: "enlisted" },
  { abbr: "PVT", short: "Pvt", name: "Private", grade: "E-2", tier: "enlisted", requires: { ops: 3, service: 21, requiredReading: true }, typical: "3 weeks" },
  { abbr: "PFC", short: "Pfc", name: "Private First Class", grade: "E-3", tier: "enlisted", requires: { ops: 8, service: 60, days: 30 }, typical: "2 months" },
  { abbr: "SPC", short: "Spc", name: "Specialist", grade: "E-4", tier: "enlisted", requires: { ops: 16, service: 120, days: 45 }, typical: "4 months" },
  { abbr: "CPL", short: "Cpl", name: "Corporal", grade: "E-4", tier: "nco", requires: { ops: 24, service: 180, days: 60, approval: true }, typical: "6 months" },
  { abbr: "SGT", short: "Sgt", name: "Sergeant", grade: "E-5", tier: "nco", requires: { ops: 36, service: 270, days: 90, quals: ["team-leader-course"], approval: true, requiredReading: true }, typical: "9 months" },
  { abbr: "SSG", short: "SSgt", name: "Staff Sergeant", grade: "E-6", tier: "nco", requires: { ops: 50, service: 365, days: 120, approval: true }, typical: "12–14 months" },
  { abbr: "SFC", short: "SFC", name: "Sergeant First Class", grade: "E-7", tier: "nco", requires: { ops: 65, service: 540, days: 150, approval: true }, typical: "18–20 months" },
  { abbr: "2LT", short: "2Lt", name: "Second Lieutenant", grade: "O-1", tier: "officer", requires: { ops: 80, service: 730, days: 180, approval: true, requiredReading: true }, typical: "2 years" },
  { abbr: "1LT", short: "1Lt", name: "First Lieutenant", grade: "O-2", tier: "officer", requires: { ops: 100, service: 910, days: 180, approval: true }, typical: "2½ years" },
  { abbr: "DCDR", short: "DCdr", name: "Deputy Commander", grade: "O-3", tier: "officer", requires: { ops: 125, service: 1095, days: 240, approval: true }, typical: "3 years" },
  { abbr: "CDR", short: "Cdr", name: "Commander", grade: "O-4", tier: "officer", requires: { ops: 150, service: 1275, days: 270, approval: true }, typical: "3½ years or more" },
];

export const RECRUIT_RANK = RANKS[0].abbr;

// The qualification that marks a recruit as trained in the recruit pipeline
// (src/lib/recruit-pipeline.ts). A vault slug.
export const BASIC_TRAINING_QUAL = "basic-combat-training";

// Billets are slot caps per role: an ORBAT entry, not a suggestion. A role
// a squad doesn't list can't be held in that squad.
export type SquadDef = { name: string; callsign: string; blurb: string; billets: Record<string, number> };

export const SQUADS: readonly SquadDef[] = [
  {
    name: "Command",
    callsign: "Raven",
    blurb: "Mission planning, coordination and unit leadership.",
    billets: { Command: 3, "Communications / Intelligence Specialist": 1 },
  },
  {
    name: "Alpha",
    callsign: "Talon",
    blurb: "Frontline assault and infantry.",
    billets: { "Team Leader": 1, Assaulter: 3, Medic: 1, "Assistant Medic": 1 },
  },
  {
    name: "Bravo",
    callsign: "Havoc",
    blurb: "Frontline assault and infantry.",
    billets: { "Team Leader": 1, Assaulter: 3, Medic: 1, "Assistant Medic": 1 },
  },
  {
    name: "Charlie",
    callsign: "Hammer",
    blurb: "Frontline assault and infantry.",
    billets: { "Team Leader": 1, Assaulter: 3, Medic: 1, "Assistant Medic": 1 },
  },
  {
    name: "Delta",
    callsign: "Reaper",
    blurb: "Logistics: piloting, driving and building FOBs.",
    billets: { "Team Leader": 1, Technician: 3 },
  },
  {
    name: "Echo",
    callsign: "Shadow",
    blurb: "Reconnaissance, sniping and overwatch.",
    billets: { "Team Leader": 1, Operator: 3 },
  },
];

// Roles (MOS). `requires` lists vault qualification slugs the member must
// hold to request it as primary or secondary. `leads` marks billets whose
// holders act as leadership for their own squad: they see its restricted
// files and decide its role and leave requests.
// `about` is optional longer copy for the public About > Billets page.
// `name` is stored on each member and in the Admin page's role mapping, so
// renaming one needs a data migration (see prisma/migrations/*_team_billets
// and *_squad_restructure).
export type RoleDef = { name: string; code: string; blurb: string; requires: string[]; leads?: boolean; about?: string };

const LEADS = " A leadership billet: also decides the squad's role and leave requests.";

export const ROLES: readonly RoleDef[] = [
  { name: "Team Leader", code: "TL", blurb: "Commands the team.", requires: ["basic-combat-training", "team-leader-course"], leads: true, about: "Commands the team; typically a Master Sergeant (E-8) or senior Sergeant First Class (E-7)." + LEADS },
  { name: "Assaulter", code: "ASLT", blurb: "The core tactical element.", requires: ["basic-combat-training"], about: "Forms the core tactical element; executes room clearing, close-quarters battle (CQB), and primary target engagement." },
  { name: "Medic", code: "MED", blurb: "Tactical combat casualty care under fire.", requires: ["basic-combat-training", "combat-lifesaver"], about: "Advanced tactical combat casualty care (TCCC) specialist trained to manage trauma and provide prolonged field care under fire." },
  { name: "Assistant Medic", code: "AMED", blurb: "Backs up the medic and keeps casualties moving.", requires: ["basic-combat-training"], about: "Works alongside the team's medic: first aid under fire, casualty drags and evacuation, and taking over care when the medic is down." },
  { name: "Technician", code: "TECH", blurb: "Pilots, drives and builds FOBs.", requires: ["basic-combat-training"], about: "Keeps the unit moving and supplied: flies and drives its transport, runs logistics and resupply, and builds and maintains forward operating bases (FOBs)." },
  { name: "Operator", code: "OPR", blurb: "Reconnaissance, sniping and overwatch.", requires: ["basic-combat-training", "marksman"], about: "Works ahead of the main force: reconnaissance and surveillance, precision long-range fire, and overwatch and early warning for the teams." },
  { name: "Communications / Intelligence Specialist", code: "COMMS", blurb: "Secure radio and satellite networks, and battlefield intel.", requires: ["basic-combat-training"], about: "Manages secure satellite and tactical radio networks; relays real-time battlefield data to higher command." },
  { name: "Command", code: "HQ", blurb: "Unit command staff.", requires: ["team-leader-course"], leads: true, about: "Sits on the unit's command staff, planning missions and leading the unit. A leadership billet: also decides role and leave requests across every squad." },
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
