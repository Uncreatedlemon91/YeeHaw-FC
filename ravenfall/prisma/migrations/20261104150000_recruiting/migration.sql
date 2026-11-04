-- Recruiting: the recruiter's pipeline on pending applications, events open
-- to applicants and Recruits, public summaries of past ops, and the home
-- page's media gallery.

-- CreateEnum
CREATE TYPE "RecruitStage" AS ENUM ('APPLIED', 'CONTACTED', 'INTERVIEW_SET', 'INTERVIEWED');

-- CreateEnum
CREATE TYPE "GalleryKind" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "openToRecruits" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicSummary" TEXT;

-- AlterTable
ALTER TABLE "RecruitmentApplication" ADD COLUMN     "interviewAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "recruiterId" TEXT,
ADD COLUMN     "stage" "RecruitStage" NOT NULL DEFAULT 'APPLIED',
ADD COLUMN     "stageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "GalleryItem" (
    "id" TEXT NOT NULL,
    "kind" "GalleryKind" NOT NULL,
    "filename" TEXT,
    "mime" TEXT,
    "size" INTEGER,
    "youtubeId" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "eventId" TEXT,
    "uploaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalleryItem_createdAt_idx" ON "GalleryItem"("createdAt");

-- AddForeignKey
ALTER TABLE "RecruitmentApplication" ADD CONSTRAINT "RecruitmentApplication_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryItem" ADD CONSTRAINT "GalleryItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryItem" ADD CONSTRAINT "GalleryItem_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

