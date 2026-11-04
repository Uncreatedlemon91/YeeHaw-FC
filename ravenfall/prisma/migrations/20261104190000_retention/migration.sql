-- Retention: named invitations on events (a course invites those who need
-- it) and the last inactivity check-in sent to a member.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "invitedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "checkInAt" TIMESTAMP(3);

