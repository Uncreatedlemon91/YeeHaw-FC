-- CreateEnum
CREATE TYPE "AwardKind" AS ENUM ('MEDAL', 'SERVICE', 'CAMPAIGN', 'UNIT_CITATION', 'COMMENDATION');

-- CreateEnum
CREATE TYPE "AwardDevice" AS ENUM ('NONE', 'OAK_LEAF', 'STAR', 'NUMERAL');

-- CreateEnum
CREATE TYPE "AwardSource" AS ENUM ('NOMINATION', 'AUTO');

-- CreateEnum
CREATE TYPE "NominationStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AwardKind" NOT NULL,
    "precedence" INTEGER NOT NULL DEFAULT 1000,
    "ribbon" JSONB NOT NULL DEFAULT '[]',
    "medalFile" TEXT,
    "medalMime" TEXT,
    "medalById" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "criteria" TEXT NOT NULL DEFAULT '',
    "repeatable" BOOLEAN NOT NULL DEFAULT false,
    "device" "AwardDevice" NOT NULL DEFAULT 'NONE',
    "autoRule" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberAward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "citation" TEXT NOT NULL DEFAULT '',
    "eventId" TEXT,
    "nominatedById" TEXT,
    "approvedById" TEXT,
    "source" "AwardSource" NOT NULL,
    "announcedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardNomination" (
    "id" TEXT NOT NULL,
    "nomineeId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "citation" TEXT NOT NULL,
    "eventId" TEXT,
    "nominatedById" TEXT,
    "status" "NominationStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwardNomination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Award_slug_key" ON "Award"("slug");

-- CreateIndex
CREATE INDEX "Award_precedence_idx" ON "Award"("precedence");

-- CreateIndex
CREATE INDEX "MemberAward_awardId_idx" ON "MemberAward"("awardId");

-- CreateIndex
CREATE INDEX "MemberAward_eventId_idx" ON "MemberAward"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAward_userId_awardId_sequence_key" ON "MemberAward"("userId", "awardId", "sequence");

-- CreateIndex
CREATE INDEX "AwardNomination_status_createdAt_idx" ON "AwardNomination"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AwardNomination_nomineeId_createdAt_idx" ON "AwardNomination"("nomineeId", "createdAt");

-- CreateIndex
CREATE INDEX "AwardNomination_awardId_idx" ON "AwardNomination"("awardId");

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_medalById_fkey" FOREIGN KEY ("medalById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAward" ADD CONSTRAINT "MemberAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAward" ADD CONSTRAINT "MemberAward_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAward" ADD CONSTRAINT "MemberAward_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAward" ADD CONSTRAINT "MemberAward_nominatedById_fkey" FOREIGN KEY ("nominatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAward" ADD CONSTRAINT "MemberAward_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAward" ADD CONSTRAINT "MemberAward_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardNomination" ADD CONSTRAINT "AwardNomination_nomineeId_fkey" FOREIGN KEY ("nomineeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardNomination" ADD CONSTRAINT "AwardNomination_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardNomination" ADD CONSTRAINT "AwardNomination_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardNomination" ADD CONSTRAINT "AwardNomination_nominatedById_fkey" FOREIGN KEY ("nominatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardNomination" ADD CONSTRAINT "AwardNomination_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

