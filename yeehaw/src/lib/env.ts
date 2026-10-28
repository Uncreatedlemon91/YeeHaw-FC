// Read lazily: `next build` imports these modules without a production
// .env present, so nothing here may throw at import time.

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  get siteUrl() {
    return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  /** Uploaded images (article covers) live here, outside the checkout. */
  get uploadDir() {
    return process.env.UPLOAD_DIR || (process.env.NODE_ENV === "production" ? "/opt/yeehaw/uploads" : "./uploads");
  },
  /** Times are entered and shown in this zone (IANA name). */
  get timezone() {
    return process.env.CLUB_TIMEZONE || "America/New_York";
  },
  get clientId() {
    return process.env.DISCORD_CLIENT_ID ?? "";
  },
  get publicKey() {
    return process.env.DISCORD_PUBLIC_KEY ?? "";
  },
  get botToken() {
    return process.env.DISCORD_BOT_TOKEN ?? "";
  },
  get guildId() {
    return process.env.DISCORD_GUILD_ID ?? "";
  },
  roleIds: {
    get MANAGEMENT() { return list("ROLE_IDS_MANAGEMENT"); },
    get STAFF() { return list("ROLE_IDS_STAFF"); },
    get MEMBER() { return list("ROLE_IDS_MEMBER"); },
  },
  /** Discord user IDs that are always MANAGEMENT, roles or not. For first setup. */
  get adminUserIds() {
    return list("ADMIN_USER_IDS");
  },
  /** The club's EA identity (proclubs/config.py CLUB_ID / CLUB_PLATFORM). */
  get eaClubId() {
    return process.env.EA_CLUB_ID ?? "";
  },
  get eaPlatform() {
    return process.env.EA_PLATFORM || "common-gen5";
  },
  /** Cap on the auto-built league table (proclubs/config.py LEAGUE_TABLE_MAX_TEAMS). */
  get eaLeagueMaxTeams() {
    return Math.max(2, Number.parseInt(process.env.EA_LEAGUE_MAX_TEAMS ?? "25", 10) || 25);
  },
  get eaClubName() {
    return process.env.EA_CLUB_NAME || "Yeehaw FC";
  },
  /** The AI roundup (proclubs/config.py ROUNDUP_DAYS, CLAUDE_*, WEEKLY_ARTICLE_AUTHOR). Off without a token. */
  get claudeToken() {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "";
  },
  get claudeBin() {
    return process.env.CLAUDE_BIN || "claude";
  },
  get claudeModel() {
    return process.env.CLAUDE_MODEL ?? "";
  },
  /** How often the roundup goes out, in days, and so how far back each one looks. */
  get roundupDays() {
    return Math.max(1, Number.parseInt(process.env.ROUNDUP_DAYS ?? "2", 10) || 2);
  },
  /** The byline these articles carry. */
  get articleAuthor() {
    return process.env.WEEKLY_ARTICLE_AUTHOR || "YeeHaw FC Desk";
  },
};
