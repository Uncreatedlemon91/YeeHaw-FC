-- Gamertags are matched to EA match lines case-insensitively (the poll's
-- relink and a gamertag change on the hub), so index the lowercased name.
-- Prisma can't express an expression index; the schema keeps a comment.
CREATE INDEX "EaMatchPlayer_lower_playerName_idx" ON "EaMatchPlayer" (lower("playerName"));
