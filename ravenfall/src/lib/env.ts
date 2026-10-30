// Read lazily: `next build` imports these modules without a production
// .env present, so nothing here may throw at import time.

/** "Alpha=123, Bravo=456" -> { Alpha: "123", Bravo: "456" }. */
function pairs(name: string): Record<string, string> {
  return Object.fromEntries(
    list(name)
      .map((p) => p.split("=").map((s) => s.trim()))
      .filter((kv) => kv.length === 2 && kv[0] && kv[1]),
  );
}

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
  /** Where library images live on disk. */
  get libraryUploadDir() {
    return (
      process.env.LIBRARY_UPLOAD_DIR ||
      (process.env.NODE_ENV === "production" ? "/opt/ravenfall/uploads/library" : "./uploads/library")
    );
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
  /** Where role, callsign and leave requests are posted for a decision. */
  get personnelChannelId() {
    return process.env.PERSONNEL_BOARD_CHANNEL_ID ?? "";
  },
  /** Where new and majorly-updated library documents are announced. */
  get libraryChannelId() {
    return process.env.LIBRARY_ANNOUNCE_CHANNEL_ID ?? "";
  },
  /** Where awards are announced (optional). */
  get awardsChannelId() {
    return process.env.AWARDS_ANNOUNCE_CHANNEL_ID ?? "";
  },
  /** Discord role per squad name, kept in step with each member's squad. */
  get squadRoleIds() {
    return pairs("ROLE_IDS_SQUADS");
  },
  /** Discord role per unit role (primary or secondary), kept in step too. */
  get billetRoleIds() {
    return pairs("ROLE_IDS_BILLETS");
  },
};
