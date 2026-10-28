-- A series can announce each occurrence in Discord a set number of days
-- before it starts (done by the notify job), and keeps four weeks generated
-- ahead by default.
ALTER TABLE "EventSeries" ADD COLUMN     "announceDaysBefore" INTEGER,
ALTER COLUMN "generateAheadDays" SET DEFAULT 28;
