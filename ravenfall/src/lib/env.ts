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
  get timezone() {
    return process.env.UNIT_TIMEZONE || "America/New_York";
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
    get ADMIN() { return list("ROLE_IDS_ADMIN"); },
    get RECRUITER() { return list("ROLE_IDS_RECRUITER"); },
    get INSTRUCTOR() { return list("ROLE_IDS_INSTRUCTOR"); },
    get OPERATOR() { return list("ROLE_IDS_OPERATOR"); },
  },
  /** Discord user IDs that are always ADMIN, roles or not. For first setup. */
  get adminUserIds() {
    return list("ADMIN_USER_IDS");
  },
  get candidateRoleId() {
    return process.env.ROLE_ID_CANDIDATE ?? "";
  },
  get recruitRoleId() {
    return process.env.ROLE_ID_RECRUIT ?? "";
  },
  get boardChannelId() {
    return process.env.RECRUITMENT_BOARD_CHANNEL_ID ?? "";
  },
  get welcomeChannelId() {
    return process.env.WELCOME_CHANNEL_ID ?? "";
  },
  get opsChannelId() {
    return process.env.OPS_ANNOUNCE_CHANNEL_ID ?? "";
  },
};
