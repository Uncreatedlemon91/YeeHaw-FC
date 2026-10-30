-- Qualification manuals move to the Library: one UNIT-clearance document per
-- qualification, in a "Qualification manuals" folder and linked back to it
-- through the existing relation. Qualification.content stays where it is (no
-- destructive drop). Safe to re-run: a qualification that already has a linked
-- document in that folder is skipped, and so is the folder.

INSERT INTO "LibraryFolder" ("id", "name", "parentId", "clearance", "updatedAt")
SELECT gen_random_uuid()::text, 'Qualification manuals', NULL, 'UNIT', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Qualification")
  AND NOT EXISTS (SELECT 1 FROM "LibraryFolder" f WHERE f."name" = 'Qualification manuals' AND f."parentId" IS NULL);

CREATE TEMP TABLE "_qual_manuals" ON COMMIT DROP AS
SELECT q."id" AS "qid",
       gen_random_uuid()::text AS "did",
       (SELECT f."id" FROM "LibraryFolder" f WHERE f."name" = 'Qualification manuals' AND f."parentId" IS NULL ORDER BY f."createdAt" LIMIT 1) AS "fid",
       -- The qualification's own slug unless a library route or document has it.
       CASE
         WHEN q."slug" NOT IN ('new', 'f', 'compliance', 'search')
              AND NOT EXISTS (SELECT 1 FROM "LibraryDocument" d WHERE d."slug" = q."slug") THEN q."slug"
         WHEN NOT EXISTS (SELECT 1 FROM "LibraryDocument" d WHERE d."slug" = q."slug" || '-manual')
              AND NOT EXISTS (SELECT 1 FROM "Qualification" o WHERE o."slug" = q."slug" || '-manual') THEN q."slug" || '-manual'
         ELSE q."slug" || '-manual-' || substr(md5(q."id"), 1, 6)
       END AS "slug"
FROM "Qualification" q
WHERE NOT EXISTS (
  SELECT 1
  FROM "_LibraryDocumentToQualification" l
  JOIN "LibraryDocument" d ON d."id" = l."A"
  JOIN "LibraryFolder" f ON f."id" = d."folderId" AND f."name" = 'Qualification manuals' AND f."parentId" IS NULL
  WHERE l."B" = q."id"
);

INSERT INTO "LibraryDocument" ("id", "slug", "title", "summary", "content", "clearance", "folderId", "revision", "createdById", "updatedById", "createdAt", "updatedAt")
SELECT m."did", m."slug", q."title", q."summary", q."content", 'UNIT', m."fid", 1, q."updatedById", q."updatedById", q."createdAt", q."updatedAt"
FROM "_qual_manuals" m
JOIN "Qualification" q ON q."id" = m."qid";

INSERT INTO "LibraryRevision" ("id", "documentId", "number", "title", "summary", "content", "note", "authorId")
SELECT gen_random_uuid()::text, m."did", 1, q."title", q."summary", q."content", 'Moved from the qualification vault', q."updatedById"
FROM "_qual_manuals" m
JOIN "Qualification" q ON q."id" = m."qid";

INSERT INTO "_LibraryDocumentToQualification" ("A", "B")
SELECT m."did", m."qid" FROM "_qual_manuals" m;
