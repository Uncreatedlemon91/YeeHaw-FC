import { prisma } from "./prisma";
import { RESERVED_AWARD_SLUGS } from "./awards";

// Qualifications are skills; their manuals live in the Library, one UNIT
// document each in this folder, linked through the existing relation.

export const MANUALS_FOLDER = "Qualification manuals";

/** The manuals folder, created on first use. */
export async function ensureManualsFolder() {
  const found = await prisma.libraryFolder.findFirst({ where: { name: MANUALS_FOLDER, parentId: null }, orderBy: { createdAt: "asc" } });
  return found ?? prisma.libraryFolder.create({ data: { name: MANUALS_FOLDER, clearance: "UNIT" } });
}

/** The library document holding a qualification's manual, if it has one. */
export async function manualFor(qualificationId: string) {
  const docs = await prisma.libraryDocument.findMany({
    where: { qualifications: { some: { id: qualificationId } } },
    select: { slug: true, folder: { select: { name: true, parentId: true } } },
    orderBy: { createdAt: "asc" },
  });
  return docs.find((d) => d.folder?.name === MANUALS_FOLDER && !d.folder.parentId) ?? docs[0] ?? null;
}

/** A qualification slug that no award or /vault route already uses (awards win /vault/<slug>). */
export async function freeQualificationSlug(base: string) {
  const taken = async (s: string) =>
    RESERVED_AWARD_SLUGS.has(s) ||
    !!(await prisma.qualification.findUnique({ where: { slug: s }, select: { id: true } })) ||
    !!(await prisma.award.findUnique({ where: { slug: s }, select: { id: true } }));
  let slug = base || "qualification";
  for (let n = 2; await taken(slug); n++) slug = `${base || "qualification"}-${n}`;
  return slug;
}
