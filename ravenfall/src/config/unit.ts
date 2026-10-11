// Unit identity and structure. Edit these to suit the unit; nothing here is
// secret, so it lives in code rather than .env.

export const UNIT = {
  name: "Wardogs",
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

// Highest last. `abbr` is what goes in a member's Discord nickname.
export const RANKS = [
  { abbr: "RCT", name: "Recruit" },
  { abbr: "PVT", name: "Private" },
  { abbr: "PFC", name: "Private First Class" },
  { abbr: "SPC", name: "Specialist" },
  { abbr: "CPL", name: "Corporal" },
  { abbr: "SGT", name: "Sergeant" },
  { abbr: "SSG", name: "Staff Sergeant" },
  { abbr: "SFC", name: "Sergeant First Class" },
  { abbr: "2LT", name: "Second Lieutenant" },
  { abbr: "1LT", name: "First Lieutenant" },
  { abbr: "CPT", name: "Captain" },
  { abbr: "MAJ", name: "Major" },
] as const;

export const RECRUIT_RANK = RANKS[0].abbr;

export const SQUADS = [
  { name: "Command", blurb: "Mission planning, coordination and unit leadership." },
  { name: "Alpha", blurb: "Line infantry. Assault, clearance and holding ground." },
  { name: "Bravo", blurb: "Line infantry. Fire support and manoeuvre element." },
  { name: "Charlie", blurb: "Reconnaissance, marksmen and forward observers." },
  { name: "Reaper", blurb: "Rotary-wing transport, CAS and medevac." },
  { name: "Medical", blurb: "Combat medics and casualty evacuation." },
];

export const UNIT_ROLES = [
  "Rifleman",
  "Automatic Rifleman",
  "Grenadier",
  "Marksman",
  "Combat Medic",
  "Radio Operator",
  "Team Leader",
  "Squad Leader",
  "Pilot",
  "Command",
];

export function rankIndex(abbr: string | null | undefined): number {
  return RANKS.findIndex((r) => r.abbr === abbr);
}

export function rankName(abbr: string | null | undefined): string {
  return RANKS.find((r) => r.abbr === abbr)?.name ?? abbr ?? "Unranked";
}

// Discord caps nicknames at 32 characters.
export function nickname(rank: string | null | undefined, callsign: string): string {
  return (rank ? `[${rank}] ${callsign}` : callsign).slice(0, 32);
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
  { key: "why", label: "Why do you want to join the Wardogs?", type: "textarea", required: true, max: 2000 },
  { key: "referral", label: "How did you find us?", type: "text", required: false, max: 200 },
] as const;

export type QuestionKey = (typeof APPLICATION_QUESTIONS)[number]["key"];
