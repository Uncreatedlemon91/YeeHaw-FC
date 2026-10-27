-- CreateEnum
CREATE TYPE "LibraryClearance" AS ENUM ('PUBLIC', 'UNIT', 'LEADERSHIP', 'COMMAND');

-- CreateTable
CREATE TABLE "LibraryFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "clearance" "LibraryClearance" NOT NULL DEFAULT 'UNIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryDocument" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "clearance" "LibraryClearance" NOT NULL DEFAULT 'UNIT',
    "folderId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "ackVersion" INTEGER NOT NULL DEFAULT 1,
    "requiredEveryone" BOOLEAN NOT NULL DEFAULT false,
    "requiredMinRank" TEXT,
    "requiredRanks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredSquads" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "note" TEXT,
    "major" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryAcknowledgement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ackVersion" INTEGER NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryImage" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaderId" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LibraryDocumentToQualification" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LibraryDocumentToQualification_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "LibraryFolder_parentId_idx" ON "LibraryFolder"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDocument_slug_key" ON "LibraryDocument"("slug");

-- CreateIndex
CREATE INDEX "LibraryDocument_folderId_idx" ON "LibraryDocument"("folderId");

-- CreateIndex
CREATE INDEX "LibraryDocument_clearance_updatedAt_idx" ON "LibraryDocument"("clearance", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryRevision_documentId_number_key" ON "LibraryRevision"("documentId", "number");

-- CreateIndex
CREATE INDEX "LibraryAcknowledgement_documentId_ackVersion_idx" ON "LibraryAcknowledgement"("documentId", "ackVersion");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryAcknowledgement_userId_documentId_ackVersion_key" ON "LibraryAcknowledgement"("userId", "documentId", "ackVersion");

-- CreateIndex
CREATE INDEX "LibraryImage_documentId_idx" ON "LibraryImage"("documentId");

-- CreateIndex
CREATE INDEX "_LibraryDocumentToQualification_B_index" ON "_LibraryDocumentToQualification"("B");

-- AddForeignKey
ALTER TABLE "LibraryFolder" ADD CONSTRAINT "LibraryFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LibraryFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "LibraryFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryRevision" ADD CONSTRAINT "LibraryRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryRevision" ADD CONSTRAINT "LibraryRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryAcknowledgement" ADD CONSTRAINT "LibraryAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryAcknowledgement" ADD CONSTRAINT "LibraryAcknowledgement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryImage" ADD CONSTRAINT "LibraryImage_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryImage" ADD CONSTRAINT "LibraryImage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LibraryDocumentToQualification" ADD CONSTRAINT "_LibraryDocumentToQualification_A_fkey" FOREIGN KEY ("A") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LibraryDocumentToQualification" ADD CONSTRAINT "_LibraryDocumentToQualification_B_fkey" FOREIGN KEY ("B") REFERENCES "Qualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Full-text search over title + content (src/lib/library.ts must use the
-- same expression to hit this index).
CREATE INDEX "LibraryDocument_fts_idx" ON "LibraryDocument" USING GIN (to_tsvector('english', "title" || ' ' || "content"));
