import { RANKS, rankIndex, type RankDef } from "@/config/unit";

// Promotion readiness against the criteria in src/config/unit.ts. This only
// advises: Command still promotes from the personnel file.

export type Check = {
  label: string;
  have: number;
  need: number;
  ok: boolean;
  /** "qualification" and "approval" render as a single line, not a bar. */
  detail?: "qualification" | "approval";
};

export type Career = {
  current: RankDef | null;
  next: RankDef | null;
  since: Date | null;
  daysInGrade: number | null;
  daysInService: number | null;
  checks: Check[];
  /** Every measurable criterion met (events, time, qualifications). */
  eligible: boolean;
  /** The next rank also needs leadership to sign off. */
  needsApproval: boolean;
};

const daysSince = (d: Date | null | undefined, now: Date) =>
  d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / 864e5)) : null;

export function career(opts: {
  rank: string | null;
  since: Date | null;
  enlistedAt: Date | null;
  opsAttended: number;
  quals: readonly string[];
  qualTitles?: Record<string, string>;
  now?: Date;
}): Career {
  const i = rankIndex(opts.rank);
  const current = i >= 0 ? RANKS[i] : null;
  const next = i >= 0 ? (RANKS[i + 1] ?? null) : null;
  const now = opts.now ?? new Date();
  const daysInGrade = daysSince(opts.since, now);
  const daysInService = daysSince(opts.enlistedAt, now);
  const checks: Check[] = [];
  const req = next?.requires;
  if (req?.ops) checks.push({ label: "Events attended", have: opts.opsAttended, need: req.ops, ok: opts.opsAttended >= req.ops });
  if (req?.service)
    checks.push({ label: "Days in the PMC", have: daysInService ?? 0, need: req.service, ok: (daysInService ?? 0) >= req.service });
  if (req?.days)
    checks.push({
      label: `Days as ${current?.abbr ?? "current rank"}`,
      have: daysInGrade ?? 0,
      need: req.days,
      ok: (daysInGrade ?? 0) >= req.days,
    });
  for (const q of req?.quals ?? []) {
    const ok = opts.quals.includes(q);
    checks.push({ label: opts.qualTitles?.[q] ?? q, have: ok ? 1 : 0, need: 1, ok, detail: "qualification" });
  }
  const eligible = !!next && checks.every((c) => c.ok);
  const needsApproval = !!req?.approval;
  // Shown last and never ticked here: the promotion itself is the approval.
  if (needsApproval) checks.push({ label: "Leadership approval", have: 0, need: 1, ok: false, detail: "approval" });
  return { current, next, since: opts.since, daysInGrade, daysInService, checks, eligible, needsApproval };
}
