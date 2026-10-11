// Starter vault content: the core qualifications every unit needs, with
// outline manuals to edit. Re-running only adds what's missing.
//   npm run db:seed

import { PrismaClient, type QualificationCategory } from "@prisma/client";

const prisma = new PrismaClient();

const DOCS: { slug: string; title: string; category: QualificationCategory; summary: string; content: string }[] = [
  {
    slug: "basic-combat-training",
    title: "Basic Combat Training",
    category: "GENERAL",
    summary: "Required for every recruit before promotion to Private.",
    content: `# Basic Combat Training

Every recruit completes BCT before their first promotion.

## Standards
1. **Radio discipline** — use the correct net, keep transmissions brief, use callsigns.
2. **Formations** — wedge, file, line; know your position and spacing.
3. **Fire & manoeuvre** — bounding by pairs and by fireteams.
4. **Contact drills** — react to contact front, left, right, rear.
5. **Casualty basics** — drag, cover, call for a medic.

## Assessment
An instructor observes the recruit during a training session. Pass on all five standards to qualify.
`,
  },
  {
    slug: "combat-lifesaver",
    title: "Combat Lifesaver",
    category: "MEDICAL",
    summary: "Advanced first aid for non-medics.",
    content: `# Combat Lifesaver

## Standards
- Triage: identify and prioritise casualties.
- Tourniquets, bandaging, splinting.
- Casualty reports over the radio (9-line MEDEVAC format).

## Assessment
Treat three simulated casualties within the time limit set by the instructor.
`,
  },
  {
    slug: "team-leader-course",
    title: "Team Leader Course",
    category: "LEADERSHIP",
    summary: "Leading a four-person fireteam.",
    content: `# Team Leader Course

## Standards
- Issue a fireteam-level order (SMEAC).
- Control fire and movement of the team under contact.
- Report up to the squad leader with SITREPs.

## Prerequisites
Basic Combat Training, rank of Private First Class or above.
`,
  },
  {
    slug: "marksman",
    title: "Designated Marksman",
    category: "WEAPONS",
    summary: "Engaging targets beyond the rifleman's effective range.",
    content: `# Designated Marksman

## Standards
- Range estimation and holdovers.
- Target identification and prioritisation.
- Calling corrections for the team.
`,
  },
  {
    slug: "rotary-wing-pilot",
    title: "Rotary Wing Pilot",
    category: "PILOT",
    summary: "Transport and medevac flight qualification.",
    content: `# Rotary Wing Pilot

## Standards
- Startup, hover, and landing in confined LZs.
- Formation flight and approach under fire.
- Coordinating insertions with ground elements.
`,
  },
];

async function main() {
  for (const d of DOCS) {
    await prisma.qualification.upsert({ where: { slug: d.slug }, create: d, update: {} });
  }
  console.log(`Vault seeded: ${DOCS.length} documents.`);
}

main().finally(() => prisma.$disconnect());
