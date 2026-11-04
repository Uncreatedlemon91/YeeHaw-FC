-- Events can be for chosen squads only (empty: the whole unit, as before).
ALTER TABLE "Event" ADD COLUMN "invitedSquads" TEXT[] DEFAULT ARRAY[]::TEXT[];
-- Members who left the Discord server while they still have a file.
ALTER TABLE "User" ADD COLUMN "leftDiscordAt" TIMESTAMP(3);
