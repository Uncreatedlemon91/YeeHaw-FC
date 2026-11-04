-- The qualification builder: badge, prerequisites, minimum rank, assessment
-- tasks, recertification, holder certification, retirement and order; expiry
-- and assessor notes on each certification; courses (events that certify).

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "courseId" TEXT;

-- AlterTable
ALTER TABLE "Qualification" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "badgeCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "badgeColor" TEXT,
ADD COLUMN     "badgeShape" TEXT NOT NULL DEFAULT 'TAB',
ADD COLUMN     "holdersCanCertify" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minRank" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "validDays" INTEGER;

-- AlterTable
ALTER TABLE "UserQualification" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "_QualPrereqs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_QualPrereqs_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_QualPrereqs_B_index" ON "_QualPrereqs"("B");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Qualification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QualPrereqs" ADD CONSTRAINT "_QualPrereqs_A_fkey" FOREIGN KEY ("A") REFERENCES "Qualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QualPrereqs" ADD CONSTRAINT "_QualPrereqs_B_fkey" FOREIGN KEY ("B") REFERENCES "Qualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep today's order (category, then title) as the starting position.
UPDATE "Qualification" q SET "position" = o.n FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY category, title) AS n FROM "Qualification") o WHERE o.id = q.id;
