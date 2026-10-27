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
  get eaClubName() {
    return process.env.EA_CLUB_NAME || "Yeehaw FC";
  },
};
