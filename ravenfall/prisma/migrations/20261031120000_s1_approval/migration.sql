-- Automatic awards and promotions become recommendations S1 approves.
ALTER TYPE "RequestType" ADD VALUE 'PROMOTION';

ALTER TABLE "AwardNomination" ADD COLUMN "source" "AwardSource" NOT NULL DEFAULT 'NOMINATION';
ALTER TABLE "AwardNomination" ADD COLUMN "sequence" INTEGER;
CREATE UNIQUE INDEX "AwardNomination_nomineeId_awardId_sequence_key" ON "AwardNomination"("nomineeId", "awardId", "sequence");

-- The unit's announcement channels for awards, promotions and billet
-- assignments. Only touches a channel setting already saved on the Admin
-- page; without one the *_CHANNEL_ID values in .env are used.
UPDATE "Setting"
SET "value" = "value" || '{"awards": "1558687734464254042", "promotions": "1558687705351856278", "assignments": "1566189317850661004"}'::jsonb,
    "updatedAt" = now()
WHERE "key" = 'channels';
