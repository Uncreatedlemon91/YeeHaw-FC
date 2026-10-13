-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('ROLE', 'CALLSIGN', 'LOA');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ServiceRecordType" ADD VALUE 'COUNSELING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "availability" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "loadout" TEXT,
ADD COLUMN     "rankSince" TIMESTAMP(3),
ADD COLUMN     "secondaryRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "PersonnelRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "reason" TEXT,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "boardMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonnelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonnelRequest_status_createdAt_idx" ON "PersonnelRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PersonnelRequest_userId_createdAt_idx" ON "PersonnelRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonnelRequest_type_status_startDate_endDate_idx" ON "PersonnelRequest"("type", "status", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "PersonnelRequest" ADD CONSTRAINT "PersonnelRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelRequest" ADD CONSTRAINT "PersonnelRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill time-in-grade: the latest promotion entry, else enlistment.
UPDATE "User" u SET "rankSince" = COALESCE(
  (SELECT MAX(r."createdAt") FROM "ServiceRecord" r WHERE r."userId" = u."id" AND r."type" = 'PROMOTION'),
  u."enlistedAt"
) WHERE u."rank" IS NOT NULL;
