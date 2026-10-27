-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SeasonState" AS ENUM ('DRAFT', 'WINDOW', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ContractState" AS ENUM ('OFFERED', 'ACTIVE', 'DECLINED', 'RELEASED', 'ENDED');

-- CreateEnum
CREATE TYPE "SquadStatus" AS ENUM ('STARTER', 'ROTATION', 'SUBSTITUTE');

-- CreateEnum
CREATE TYPE "Captaincy" AS ENUM ('NONE', 'CAPTAIN', 'VICE');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GOALKEEPER', 'CENTRE_BACK', 'FULL_BACK', 'WING_BACK', 'DEFENSIVE_MIDFIELD', 'CENTRE_MIDFIELD', 'ATTACKING_MIDFIELD', 'WINGER', 'STRIKER', 'ANY_OUTFIELD');

-- CreateEnum
CREATE TYPE "ObjectiveKind" AS ENUM ('APPEARANCES', 'GOALS', 'ASSISTS', 'AVG_RATING', 'ATTENDANCE', 'CLEAN_SHEETS', 'MOTM');

-- CreateEnum
CREATE TYPE "ClubRole" AS ENUM ('PRESIDENT', 'HEAD_COACH', 'COACH');

-- CreateEnum
CREATE TYPE "RosterMoveKind" AS ENUM ('OFFER', 'ACCEPT', 'DECLINE', 'RELEASE', 'RENEWAL', 'CHANGE', 'EXPIRE', 'STAFF_OFFER', 'SIGNING');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MATCH', 'SCRIM', 'TOURNAMENT', 'COMMUNITY', 'TRAINING', 'THEORY');

-- CreateEnum
CREATE TYPE "SignupStatus" AS ENUM ('GOING', 'MAYBE', 'OUT');

-- CreateEnum
CREATE TYPE "SignupSource" AS ENUM ('SITE', 'DISCORD');

-- CreateEnum
CREATE TYPE "Attendance" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "ServiceEntryKind" AS ENUM ('COMMENDATION', 'WARNING', 'NOTE');

-- CreateEnum
CREATE TYPE "ArticleCategory" AS ENUM ('NEWS', 'TRANSFER', 'MATCH_HIGHLIGHT');

-- CreateEnum
CREATE TYPE "ArticleSource" AS ENUM ('STAFF', 'AI');

-- CreateEnum
CREATE TYPE "ArticleFormat" AS ENUM ('MARKDOWN', 'HTML');

-- CreateEnum
CREATE TYPE "ProspectStage" AS ENUM ('PROSPECT', 'TRIAL', 'OFFERED', 'SIGNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN', 'PLANNED', 'DONE', 'DECLINED');

-- CreateEnum
CREATE TYPE "LineupStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordUsername" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatar" TEXT,
    "slug" TEXT NOT NULL,
    "gamertag" TEXT,
    "clubRole" "ClubRole",
    "clubRoleSince" TIMESTAMP(3),
    "preferredFoot" TEXT,
    "archetype" TEXT,
    "bio" TEXT,
    "timezone" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "windowOpensAt" TIMESTAMP(3) NOT NULL,
    "state" "SeasonState" NOT NULL DEFAULT 'DRAFT',
    "windowOpenedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "announcedAt" TIMESTAMP(3),
    "endReminderAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "shirtNumber" INTEGER,
    "squadStatus" "SquadStatus" NOT NULL,
    "position" "Position",
    "secondaryPosition" "Position",
    "captaincy" "Captaincy" NOT NULL DEFAULT 'NONE',
    "state" "ContractState" NOT NULL DEFAULT 'OFFERED',
    "previousContractId" TEXT,
    "offeredById" TEXT,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offerChannelId" TEXT,
    "offerMessageId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "rolesGranted" BOOLEAN NOT NULL DEFAULT false,
    "roleError" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releaseNote" TEXT,
    "endedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractObjective" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "ObjectiveKind" NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContractObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterMove" (
    "id" TEXT NOT NULL,
    "kind" "RosterMoveKind" NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "seasonId" TEXT,
    "contractId" TEXT,
    "position" "Position",
    "secondaryPosition" "Position",
    "squadStatus" "SquadStatus",
    "note" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "discordChannelId" TEXT,
    "discordMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "EventType" NOT NULL DEFAULT 'TRAINING',
    "opponent" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "weekdays" INTEGER[],
    "timeOfDay" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 90,
    "formation" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "generateAheadDays" INTEGER NOT NULL DEFAULT 21,
    "generatedThrough" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "EventType" NOT NULL DEFAULT 'MATCH',
    "opponent" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "image" TEXT,
    "createdById" TEXT,
    "seriesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "discordChannelId" TEXT,
    "discordMessageId" TEXT,
    "discordThreadId" TEXT,
    "signupsOpen" BOOLEAN NOT NULL DEFAULT true,
    "formation" TEXT,
    "lineupPublishedAt" TIMESTAMP(3),
    "lineupMessageId" TEXT,
    "usScore" INTEGER,
    "oppScore" INTEGER,
    "result" TEXT,
    "reviewNotes" TEXT,
    "reviewClips" TEXT,
    "reviewPublishedAt" TIMESTAMP(3),
    "reviewPublishedBy" TEXT,
    "voteOpenedAt" TIMESTAMP(3),
    "voteClosesAt" TIMESTAMP(3),
    "voteMessageId" TEXT,
    "sessionObjective" TEXT,
    "sessionPlan" TEXT,
    "roleBriefs" JSONB,
    "sessionReview" TEXT,
    "sessionReviewedBy" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSignup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "SignupStatus" NOT NULL DEFAULT 'GOING',
    "slotKey" TEXT,
    "source" "SignupSource" NOT NULL DEFAULT 'SITE',
    "pref1" "Position",
    "pref2" "Position",
    "pref3" "Position",
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "attendance" "Attendance",
    "attendanceMarkedBy" TEXT,
    "attendanceMarkedAt" TIMESTAMP(3),

    CONSTRAINT "EventSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLineup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTierInvite" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tierKey" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memberCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventTierInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRating" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "selfRating" INTEGER,
    "coachRating" INTEGER,
    "coachComment" TEXT,
    "coachName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotmVote" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "nomineeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotmVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "detail" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lineup" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT,
    "formation" TEXT NOT NULL,
    "status" "LineupStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineupSlot" (
    "id" TEXT NOT NULL,
    "lineupId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "LineupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TacticsBoard" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activeFormation" TEXT NOT NULL DEFAULT '4-3-3',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByName" TEXT,

    CONSTRAINT "TacticsBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TacticsSlot" (
    "id" TEXT NOT NULL,
    "formation" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "playerId" TEXT,
    "playerName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TacticsSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetPiece" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "side" TEXT,
    "takerId" TEXT,
    "routine" TEXT,
    "targets" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSuggestion" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
    "staffNote" TEXT,
    "handledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityPattern" (
    "playerId" TEXT NOT NULL,
    "days" TEXT NOT NULL DEFAULT '0000000',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityPattern_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "AvailabilityAway" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityAway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceEntry" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" "ServiceEntryKind" NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "announcedAt" TIMESTAMP(3),

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerOfTheMonth" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "announcedAt" TIMESTAMP(3),

    CONSTRAINT "PlayerOfTheMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PotmWinner" (
    "potmId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "PotmWinner_pkey" PRIMARY KEY ("potmId","playerId")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "playerId" TEXT,
    "discordId" TEXT,
    "gamertag" TEXT,
    "position" "Position",
    "secondaryPosition" "Position",
    "stage" "ProspectStage" NOT NULL DEFAULT 'PROSPECT',
    "source" TEXT,
    "addedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "onboarding" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectNote" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "eventId" TEXT,
    "rating" INTEGER,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "discordMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "ArticleCategory" NOT NULL DEFAULT 'NEWS',
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "format" "ArticleFormat" NOT NULL DEFAULT 'MARKDOWN',
    "coverImage" TEXT,
    "coverThumb" TEXT,
    "coverFocalX" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "coverFocalY" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "source" "ArticleSource" NOT NULL DEFAULT 'STAFF',
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "discordChannelId" TEXT,
    "discordMessageId" TEXT,
    "discordReactionCount" INTEGER,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EaClubSnapshot" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "division" TEXT,
    "bestDivision" TEXT,
    "points" INTEGER,
    "skillRating" INTEGER,
    "wins" INTEGER,
    "losses" INTEGER,
    "ties" INTEGER,
    "goals" INTEGER,
    "goalsAgainst" INTEGER,
    "promotions" INTEGER,
    "relegations" INTEGER,
    "teamSize" INTEGER,

    CONSTRAINT "EaClubSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EaMatch" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3),
    "matchType" TEXT NOT NULL,
    "usScore" INTEGER,
    "oppScore" INTEGER,
    "oppName" TEXT,
    "oppClubId" TEXT,
    "outcome" TEXT NOT NULL,
    "forfeit" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT,

    CONSTRAINT "EaMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EaMatchPlayer" (
    "id" TEXT NOT NULL,
    "matchRef" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "playerId" TEXT,
    "pos" TEXT,
    "rating" DOUBLE PRECISION,
    "goals" INTEGER,
    "assists" INTEGER,
    "shots" INTEGER,
    "passesMade" INTEGER,
    "passAttempts" INTEGER,
    "tacklesMade" INTEGER,
    "tackleAttempts" INTEGER,
    "saves" INTEGER,
    "mom" BOOLEAN NOT NULL DEFAULT false,
    "redCards" INTEGER,
    "cleanSheet" BOOLEAN NOT NULL DEFAULT false,
    "minutesPlayed" INTEGER,

    CONSTRAINT "EaMatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EaLeagueClub" (
    "platform" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "label" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EaLeagueClub_pkey" PRIMARY KEY ("platform","clubId")
);

-- CreateTable
CREATE TABLE "EaMemberTotal" (
    "platform" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "gamesPlayed" INTEGER,
    "goals" INTEGER,
    "assists" INTEGER,
    "mom" INTEGER,
    "passesMade" INTEGER,
    "passSuccess" DOUBLE PRECISION,
    "tacklesMade" INTEGER,
    "tackleSuccess" DOUBLE PRECISION,
    "shotSuccess" DOUBLE PRECISION,
    "ratingAvg" DOUBLE PRECISION,
    "cleanSheets" INTEGER,
    "redCards" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EaMemberTotal_pkey" PRIMARY KEY ("platform","clubId","playerName")
);

-- CreateTable
CREATE TABLE "EaSquadMember" (
    "platform" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EaSquadMember_pkey" PRIMARY KEY ("platform","clubId","playerName")
);

-- CreateTable
CREATE TABLE "EaSquadMove" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "move" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EaSquadMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_discordId_key" ON "Player"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_slug_key" ON "Player"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Player_gamertag_key" ON "Player"("gamertag");

-- CreateIndex
CREATE INDEX "Season_startsAt_idx" ON "Season"("startsAt");

-- CreateIndex
CREATE INDEX "Contract_playerId_idx" ON "Contract"("playerId");

-- CreateIndex
CREATE INDEX "Contract_seasonId_state_idx" ON "Contract"("seasonId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_seasonId_playerId_key" ON "Contract"("seasonId", "playerId");

-- CreateIndex
CREATE INDEX "ContractObjective_contractId_idx" ON "ContractObjective"("contractId");

-- CreateIndex
CREATE INDEX "RosterMove_playerId_createdAt_idx" ON "RosterMove"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "RosterMove_seasonId_idx" ON "RosterMove"("seasonId");

-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_seriesId_startsAt_key" ON "Event"("seriesId", "startsAt");

-- CreateIndex
CREATE INDEX "EventSignup_playerId_idx" ON "EventSignup"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSignup_eventId_playerId_key" ON "EventSignup"("eventId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "EventLineup_eventId_slotKey_key" ON "EventLineup"("eventId", "slotKey");

-- CreateIndex
CREATE UNIQUE INDEX "EventLineup_eventId_playerId_key" ON "EventLineup"("eventId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTierInvite_eventId_tierKey_key" ON "EventTierInvite"("eventId", "tierKey");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRating_eventId_playerId_key" ON "MatchRating"("eventId", "playerId");

-- CreateIndex
CREATE INDEX "MotmVote_nomineeId_idx" ON "MotmVote"("nomineeId");

-- CreateIndex
CREATE UNIQUE INDEX "MotmVote_eventId_voterId_key" ON "MotmVote"("eventId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_kind_key_key" ON "Notification"("kind", "key");

-- CreateIndex
CREATE INDEX "Lineup_status_publishedAt_idx" ON "Lineup"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LineupSlot_lineupId_slotKey_key" ON "LineupSlot"("lineupId", "slotKey");

-- CreateIndex
CREATE UNIQUE INDEX "LineupSlot_lineupId_playerId_key" ON "LineupSlot"("lineupId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TacticsSlot_formation_slotKey_key" ON "TacticsSlot"("formation", "slotKey");

-- CreateIndex
CREATE INDEX "TrainingSuggestion_playerId_idx" ON "TrainingSuggestion"("playerId");

-- CreateIndex
CREATE INDEX "AvailabilityAway_playerId_endsOn_idx" ON "AvailabilityAway"("playerId", "endsOn");

-- CreateIndex
CREATE INDEX "ServiceEntry_playerId_occurredAt_idx" ON "ServiceEntry"("playerId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_playerId_key_key" ON "Milestone"("playerId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerOfTheMonth_month_key" ON "PlayerOfTheMonth"("month");

-- CreateIndex
CREATE INDEX "Prospect_stage_idx" ON "Prospect"("stage");

-- CreateIndex
CREATE INDEX "ProspectNote_prospectId_idx" ON "ProspectNote"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_published_publishedAt_idx" ON "Article"("published", "publishedAt");

-- CreateIndex
CREATE INDEX "EaClubSnapshot_platform_clubId_capturedAt_idx" ON "EaClubSnapshot"("platform", "clubId", "capturedAt");

-- CreateIndex
CREATE INDEX "EaMatch_platform_clubId_playedAt_idx" ON "EaMatch"("platform", "clubId", "playedAt");

-- CreateIndex
CREATE INDEX "EaMatch_eventId_idx" ON "EaMatch"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EaMatch_matchId_clubId_key" ON "EaMatch"("matchId", "clubId");

-- CreateIndex
CREATE INDEX "EaMatchPlayer_playerName_idx" ON "EaMatchPlayer"("playerName");

-- CreateIndex
CREATE INDEX "EaMatchPlayer_playerId_idx" ON "EaMatchPlayer"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "EaMatchPlayer_matchRef_playerName_key" ON "EaMatchPlayer"("matchRef", "playerName");

-- CreateIndex
CREATE INDEX "EaSquadMove_platform_clubId_movedAt_idx" ON "EaSquadMove"("platform", "clubId", "movedAt");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_previousContractId_fkey" FOREIGN KEY ("previousContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_offeredById_fkey" FOREIGN KEY ("offeredById") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractObjective" ADD CONSTRAINT "ContractObjective_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterMove" ADD CONSTRAINT "RosterMove_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterMove" ADD CONSTRAINT "RosterMove_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterMove" ADD CONSTRAINT "RosterMove_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterMove" ADD CONSTRAINT "RosterMove_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSignup" ADD CONSTRAINT "EventSignup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSignup" ADD CONSTRAINT "EventSignup_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLineup" ADD CONSTRAINT "EventLineup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLineup" ADD CONSTRAINT "EventLineup_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTierInvite" ADD CONSTRAINT "EventTierInvite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRating" ADD CONSTRAINT "MatchRating_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRating" ADD CONSTRAINT "MatchRating_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotmVote" ADD CONSTRAINT "MotmVote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotmVote" ADD CONSTRAINT "MotmVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotmVote" ADD CONSTRAINT "MotmVote_nomineeId_fkey" FOREIGN KEY ("nomineeId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lineup" ADD CONSTRAINT "Lineup_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lineup" ADD CONSTRAINT "Lineup_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupSlot" ADD CONSTRAINT "LineupSlot_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "Lineup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupSlot" ADD CONSTRAINT "LineupSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TacticsSlot" ADD CONSTRAINT "TacticsSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetPiece" ADD CONSTRAINT "SetPiece_takerId_fkey" FOREIGN KEY ("takerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSuggestion" ADD CONSTRAINT "TrainingSuggestion_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityPattern" ADD CONSTRAINT "AvailabilityPattern_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityAway" ADD CONSTRAINT "AvailabilityAway_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEntry" ADD CONSTRAINT "ServiceEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEntry" ADD CONSTRAINT "ServiceEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotmWinner" ADD CONSTRAINT "PotmWinner_potmId_fkey" FOREIGN KEY ("potmId") REFERENCES "PlayerOfTheMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotmWinner" ADD CONSTRAINT "PotmWinner_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectNote" ADD CONSTRAINT "ProspectNote_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectNote" ADD CONSTRAINT "ProspectNote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectNote" ADD CONSTRAINT "ProspectNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EaMatch" ADD CONSTRAINT "EaMatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EaMatchPlayer" ADD CONSTRAINT "EaMatchPlayer_matchRef_fkey" FOREIGN KEY ("matchRef") REFERENCES "EaMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EaMatchPlayer" ADD CONSTRAINT "EaMatchPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Partial unique indexes and checks: rules Prisma's schema language cannot
-- express. Written by hand, so `prisma migrate dev` must not be used here
-- (it would drop them); apply with `prisma migrate deploy`.

-- A shirt number is held by one live (OFFERED or ACTIVE) contract per season.
-- Null numbers (contracts carried over before numbers existed) are exempt.
CREATE UNIQUE INDEX "Contract_season_shirt_live_key"
  ON "Contract" ("seasonId", "shirtNumber")
  WHERE "shirtNumber" IS NOT NULL AND "state" IN ('OFFERED', 'ACTIVE');

-- At most one live CAPTAIN and one live VICE per season.
CREATE UNIQUE INDEX "Contract_season_captaincy_live_key"
  ON "Contract" ("seasonId", "captaincy")
  WHERE "captaincy" <> 'NONE' AND "state" IN ('OFFERED', 'ACTIVE');

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_shirtNumber_range" CHECK ("shirtNumber" IS NULL OR "shirtNumber" BETWEEN 1 AND 99);

-- One WINDOW season and one ACTIVE season at a time.
CREATE UNIQUE INDEX "Season_one_open_state_key"
  ON "Season" ("state")
  WHERE "state" IN ('WINDOW', 'ACTIVE');

-- One player per formation slot per event.
CREATE UNIQUE INDEX "EventSignup_event_slot_key"
  ON "EventSignup" ("eventId", "slotKey")
  WHERE "slotKey" IS NOT NULL;

-- Singleton rows.
ALTER TABLE "TacticsBoard" ADD CONSTRAINT "TacticsBoard_singleton" CHECK ("id" = 1);
