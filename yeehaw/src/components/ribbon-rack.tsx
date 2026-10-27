import type { Ribbon } from "@/lib/service-record";

// Three stripes per ribbon family, as colour tokens (globals.css).
const STRIPES: Record<string, [string, string, string]> = {
  apps: ["var(--accent)", "var(--foreground)", "var(--accent)"],
  goals: ["var(--primary)", "var(--foreground)", "var(--primary)"],
  assists: ["var(--foreground)", "var(--info)", "var(--foreground)"],
  cs: ["var(--info)", "var(--primary)", "var(--info)"],
  motm: ["var(--gold)", "var(--gold)", "var(--gold)"],
};

/** The honours on a player's card: one small ribbon each, named for assistive tech. */
export function RibbonRack({ ribbons }: { ribbons: Ribbon[] }) {
  if (!ribbons.length) return null;
  return (
    <ul aria-label={`Ribbons: ${ribbons.length}`} className="flex flex-wrap gap-1.5">
      {ribbons.map((r, i) => {
        const [a, b, c] = STRIPES[r.family] ?? STRIPES.apps;
        return (
          <li
            key={i}
            title={r.label}
            tabIndex={0}
            className={`flex h-3.5 w-7 overflow-hidden rounded-[2px] border ${r.potm ? "border-[color:var(--gold)]" : "border-border"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          >
            <i className="flex-1" style={{ background: a }} />
            <i className="flex-1" style={{ background: b }} />
            <i className="flex-1" style={{ background: c }} />
            <span className="sr-only">{r.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
