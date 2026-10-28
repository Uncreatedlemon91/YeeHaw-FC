import { prisma } from "./prisma";

// What the club says about itself on /club: the old site's "Club profile"
// (proclubs services.CLUB_PROFILE_FIELDS), edited by management on
// /admin/club and stored as one JSON object under the "profile" setting.
// Facts the site already knows (record, squad size, staff) are filled in live.

export const PROFILE_FIELDS = [
  { key: "headline", label: "Headline", limit: 80, multiline: false, placeholder: "", fallback: "Pro Clubs, done properly." },
  {
    key: "about",
    label: "About the club",
    limit: 600,
    multiline: true,
    placeholder: "",
    fallback: "A competitive EA FC Pro Clubs side that plays as a team: set positions, a real tactic, and a squad that turns up.",
  },
  { key: "matchNights", label: "When we play", limit: 120, multiline: false, placeholder: "e.g. Tue & Thu, 8-10pm ET", fallback: "" },
  { key: "region", label: "Region", limit: 60, multiline: false, placeholder: "e.g. NA East", fallback: "" },
  { key: "platform", label: "Platform", limit: 60, multiline: false, placeholder: "e.g. PS5 & Xbox Series X|S (crossplay)", fallback: "" },
  { key: "playStyle", label: "How we play", limit: 120, multiline: false, placeholder: "e.g. Possession 4-3-3, high press", fallback: "" },
  {
    key: "recruiting",
    label: "Recruiting note",
    limit: 200,
    multiline: true,
    placeholder: "",
    fallback: "Think you'd fit? Join the Discord and say hello.",
  },
] as const;

export type ProfileKey = (typeof PROFILE_FIELDS)[number]["key"];
export type ClubProfile = Record<ProfileKey, string>;

const SETTING = "profile";

/** The stored values with the defaults filled in; a field saved blank stays blank (it is left off the page). */
export function resolveProfile(raw: unknown): ClubProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, typeof r[f.key] === "string" ? (r[f.key] as string) : f.fallback])) as ClubProfile;
}

/** Trim every field and refuse any over its limit. */
export function cleanProfile(input: Partial<Record<ProfileKey, string>>): { ok: true; value: ClubProfile } | { ok: false; fieldErrors: Record<string, string> } {
  const value = {} as ClubProfile;
  const fieldErrors: Record<string, string> = {};
  for (const f of PROFILE_FIELDS) {
    const v = (input[f.key] ?? "").trim();
    if (v.length > f.limit) fieldErrors[f.key] = `Keep it under ${f.limit} characters.`;
    value[f.key] = v;
  }
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true, value };
}

export async function getProfile(): Promise<ClubProfile> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING } });
    return resolveProfile(row?.value);
  } catch {
    return resolveProfile(null);
  }
}

export async function saveProfile(value: ClubProfile) {
  await prisma.setting.upsert({ where: { key: SETTING }, create: { key: SETTING, value }, update: { value } });
}
