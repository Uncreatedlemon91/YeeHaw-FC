-- "Not sure" RSVPs, and the Discord announcement each event keeps updated.
ALTER TYPE "AttendanceStatus" ADD VALUE 'TENTATIVE' AFTER 'ATTENDING';

ALTER TABLE "Event" ADD COLUMN "announceChannelId" TEXT;
ALTER TABLE "Event" ADD COLUMN "announceMessageId" TEXT;

-- The unit's events channel. Only touches a channel setting already saved on
-- the Admin page; without one OPS_ANNOUNCE_CHANNEL_ID in .env is used.
UPDATE "Setting"
SET "value" = "value" || '{"ops": "1558685604546613308"}'::jsonb,
    "updatedAt" = now()
WHERE "key" = 'channels';
