import { RANKS, rankIndex, type RankDef } from "@/config/unit";

// Promotion readiness against the criteria in src/config/unit.ts. This only
// advises: Command still promotes from the dossier.

export type Check = { label: string; have: number; need: number; ok: boolean; detail?: string };

export type Career = {
  current: RankDef | null;
  next: RankDef | null;
  since: Date | null;
  daysInGrade: number | null;
  checks: Check[];
  eligible: boolean;
};

export function career(opts: {
  rank: string | null;
  since: Date | null;
  opsAttended: number;
  quals: readonly string[];
  qualTitles?: Record<string, string>;
  now?: Date;
}): Career {
  const i = rankIndex(opts.rank);
  const current = i >= 0 ? RANKS[i] : null;
  const next = i >= 0 ? (RANKS[i + 1] ?? null) : null;
  const now = opts.now ?? new Date();
  const daysInGrade = opts.since ? Math.max(0, Math.floor((now.getTime() - opts.since.getTime()) / 864e5)) : null;
  const checks: Check[] = [];
  const req = next?.requires;
  if (req?.ops) checks.push({ label: "Operations attended", have: opts.opsAttended, need: req.ops, ok: opts.opsAttended >= req.ops });
  if (req?.days)
    checks.push({ label: "Days time-in-grade", have: daysInGrade ?? 0, need: req.days, ok: (daysInGrade ?? 0) >= req.days });
  for (const q of req?.quals ?? []) {
    const ok = opts.quals.includes(q);
    checks.push({ label: opts.qualTitles?.[q] ?? q, have: ok ? 1 : 0, need: 1, ok, detail: "qualification" });
  }
  return { current, next, since: opts.since, daysInGrade, checks, eligible: !!next && checks.every((c) => c.ok) };
}
