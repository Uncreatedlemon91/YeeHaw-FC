// Starter qualifications every unit needs, with outline manuals (filed in the
// Library, under "Qualification manuals") to edit. Re-running only adds what's
// missing. The award catalog comes from a migration.
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

const MANUALS = "Qualification manuals";

// Same shape the awards migration gives an existing database: each
// qualification's manual as a UNIT library document in a "Qualification
// manuals" folder, linked to it. Skips any qualification that already has one.
async function seedManuals() {
  let folder = await prisma.libraryFolder.findFirst({ where: { name: MANUALS, parentId: null } });
  folder ??= await prisma.libraryFolder.create({ data: { name: MANUALS, clearance: "UNIT" } });
  let added = 0;
  for (const q of await prisma.qualification.findMany({ include: { libraryDocs: { select: { folderId: true } } } })) {
    if (q.libraryDocs.some((m) => m.folderId === folder.id)) continue;
    // The qualification's own slug unless the library already uses it.
    const taken = async (slug: string) => !!(await prisma.libraryDocument.findUnique({ where: { slug } })) || ["new", "f", "compliance", "search"].includes(slug);
    const slug = !(await taken(q.slug)) ? q.slug : `${q.slug}-manual`;
    if (await taken(slug)) continue;
    await prisma.libraryDocument.create({
      data: {
        slug,
        title: q.title,
        summary: q.summary,
        content: q.content,
        clearance: "UNIT",
        folderId: folder.id,
        qualifications: { connect: { id: q.id } },
        revisions: { create: { number: 1, title: q.title, summary: q.summary, content: q.content, note: "Moved from the qualification vault" } },
      },
    });
    added++;
  }
  return added;
}

async function main() {
  for (const d of DOCS) {
    await prisma.qualification.upsert({ where: { slug: d.slug }, create: d, update: {} });
  }
  console.log(`Vault seeded: ${DOCS.length} qualifications.`);
  console.log(`Library: ${await seedManuals()} qualification manuals added.`);
}

main().finally(() => prisma.$disconnect());
