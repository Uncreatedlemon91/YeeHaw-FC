import { env } from "./env";

// ADMIN implies everything. RECRUITER and INSTRUCTOR are independent grants
// that each imply OPERATOR. Anyone with none of these is a guest/candidate.
export type Perm = "ADMIN" | "RECRUITER" | "INSTRUCTOR" | "OPERATOR";

export const PERM_LABELS: Record<Perm, string> = {
  ADMIN: "Command Staff",
  RECRUITER: "Recruiter",
  INSTRUCTOR: "Instructor / NCO",
  OPERATOR: "Operator",
};

/** `mapping` is the role config's perms (src/lib/role-config.ts). */
export function permsFromRoles(roleIds: string[], discordId: string | undefined, mapping: Record<Perm, string[]>): Perm[] {
  const has = (p: Perm) => mapping[p].some((id) => roleIds.includes(id));
  if (has("ADMIN") || (discordId && env.adminUserIds.includes(discordId))) return ["ADMIN", "RECRUITER", "INSTRUCTOR", "OPERATOR"];
  const perms = new Set<Perm>();
  if (has("RECRUITER")) perms.add("RECRUITER").add("OPERATOR");
  if (has("INSTRUCTOR")) perms.add("INSTRUCTOR").add("OPERATOR");
  if (has("OPERATOR")) perms.add("OPERATOR");
  return [...perms];
}

export function hasPerm(perms: readonly Perm[] | undefined, perm: Perm): boolean {
  return !!perms && (perms.includes("ADMIN") || perms.includes(perm));
}

export function topLabel(perms: readonly Perm[]): string {
  for (const p of ["ADMIN", "RECRUITER", "INSTRUCTOR", "OPERATOR"] as const) {
    if (perms.includes(p)) return PERM_LABELS[p];
  }
  return "Guest";
}
