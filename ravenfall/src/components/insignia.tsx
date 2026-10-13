import { RANKS } from "@/config/unit";
import { cn } from "@/lib/utils";

// Rank insignia drawn as SVG, US Army-style: chevrons and rockers for
// enlisted and NCO grades, bars and a leaf for officers.

const GOLD = "#c9a227";
const SILVER = "#c3c7cc";

function Chevrons({ n, rockers = 0 }: { n: number; rockers?: number }) {
  const top = 20 - (n + rockers) * 3.2;
  return (
    <g fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinejoin="round">
      {Array.from({ length: n }, (_, i) => (
        <polyline key={`c${i}`} points={`5,${top + i * 6.4 + 9} 20,${top + i * 6.4} 35,${top + i * 6.4 + 9}`} />
      ))}
      {Array.from({ length: rockers }, (_, i) => {
        const y = top + n * 6.4 + 5 + i * 6.4;
        return <path key={`r${i}`} d={`M5,${y} Q20,${y + 9} 35,${y}`} />;
      })}
    </g>
  );
}

function Shape({ abbr }: { abbr: string }) {
  switch (abbr) {
    case "PVT":
      return <Chevrons n={1} />;
    case "PFC":
      return <Chevrons n={1} rockers={1} />;
    case "SPC":
      return <path d="M7,9 L33,9 L33,21 Q20,36 7,21 Z" fill="currentColor" />;
    case "CPL":
      return <Chevrons n={2} />;
    case "SGT":
      return <Chevrons n={3} />;
    case "SSG":
      return <Chevrons n={3} rockers={1} />;
    case "SFC":
      return <Chevrons n={3} rockers={2} />;
    case "2LT":
      return <rect x={14} y={6} width={12} height={28} rx={1.5} fill={GOLD} />;
    case "1LT":
      return <rect x={14} y={6} width={12} height={28} rx={1.5} fill={SILVER} />;
    case "CPT":
      return (
        <g fill={SILVER}>
          <rect x={7} y={6} width={10} height={28} rx={1.5} />
          <rect x={23} y={6} width={10} height={28} rx={1.5} />
        </g>
      );
    case "MAJ":
      return (
        <path
          d="M20,4 C27,10 33,14 31,22 C30,28 25,30 22,31 L22,37 L18,37 L18,31 C15,30 10,28 9,22 C7,14 13,10 20,4 Z"
          fill={GOLD}
        />
      );
    default:
      return <circle cx={20} cy={20} r={9} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="3 3" />;
  }
}

export function RankInsignia({ rank, size = 40, className }: { rank: string | null | undefined; size?: number; className?: string }) {
  const name = RANKS.find((r) => r.abbr === rank)?.name ?? "Unranked";
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={name} className={cn("shrink-0 text-accent", className)}>
      <title>{name}</title>
      <Shape abbr={rank ?? ""} />
    </svg>
  );
}
