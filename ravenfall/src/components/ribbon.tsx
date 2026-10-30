import type { AwardDevice } from "@prisma/client";
import { deviceMarks, type DeviceMark, type Stripe } from "@/lib/awards";
import { cn } from "@/lib/utils";

// A service ribbon as inline SVG: the award's stripes plus devices for repeats
// (oak leaves, stars or a numeral). 36 x 10 units, the usual 1 3/8" x 3/8".
// No hooks or ids, so it renders in server and client components alike.

const W = 36;
const H = 10;
const BRONZE = "#b5833f";
const SILVER = "#d6d9de";
const EDGE = "#1c1c1c";

function Leaf({ x, silver }: { x: number; silver: boolean }) {
  return (
    <g transform={`translate(${x} 5)`} fill={silver ? SILVER : BRONZE} stroke={EDGE} strokeWidth={0.3}>
      <path d="M0 -2.4 C1 -2.4 1.1 -1.4 0.9 -0.9 C1.7 -1.1 2.1 -0.3 1.6 0.3 C2.1 0.7 1.9 1.6 1.1 1.6 C0.9 2 0.4 2.2 0 2.2 C-0.4 2.2 -0.9 2 -1.1 1.6 C-1.9 1.6 -2.1 0.7 -1.6 0.3 C-2.1 -0.3 -1.7 -1.1 -0.9 -0.9 C-1.1 -1.4 -1 -2.4 0 -2.4 Z" />
    </g>
  );
}

function Star({ x, silver }: { x: number; silver: boolean }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 0.95 : 2.3;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return <polygon transform={`translate(${x} 5)`} points={pts} fill={silver ? SILVER : BRONZE} stroke={EDGE} strokeWidth={0.3} />;
}

function Devices({ marks }: { marks: DeviceMark[] }) {
  if (!marks.length) return null;
  const first = marks[0];
  if (first.kind === "NUMERAL") {
    return (
      <text x={W / 2} y={H / 2} textAnchor="middle" dominantBaseline="central" fontSize={5.6} fontWeight={800} fontFamily="ui-sans-serif, system-ui, sans-serif" fill="#f5f5f5" stroke={EDGE} strokeWidth={0.5} paintOrder="stroke">
        {first.value}
      </text>
    );
  }
  const gap = 5;
  const x0 = W / 2 - ((marks.length - 1) * gap) / 2;
  return (
    <>
      {marks.map((m, i) =>
        m.kind === "OAK_LEAF" ? <Leaf key={i} x={x0 + i * gap} silver={m.silver} /> : m.kind === "STAR" ? <Star key={i} x={x0 + i * gap} silver={m.silver} /> : null,
      )}
    </>
  );
}

/** Text for assistive tech and tooltips: "Operations Ribbon, 3 times". */
export function ribbonLabel(name: string, count: number) {
  return count > 1 ? `${name}, ${count} times` : name;
}

export function Ribbon({
  stripes,
  device = "NONE",
  count = 1,
  label,
  className,
}: {
  stripes: Stripe[];
  device?: AwardDevice;
  /** Times the member has earned it; drives the devices. */
  count?: number;
  /** Accessible name. Omit when the ribbon sits next to its name (it is then decorative). */
  label?: string;
  className?: string;
}) {
  const total = stripes.reduce((n, s) => n + s.width, 0) || 1;
  let x = 0;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("block aspect-[36/10] h-auto w-full rounded-[1px]", className)}
      preserveAspectRatio="xMidYMid meet"
    >
      {stripes.map((s, i) => {
        const w = (s.width / total) * W;
        const rect = <rect key={i} x={x} y={0} width={w + 0.02} height={H} fill={s.color} />;
        x += w;
        return rect;
      })}
      {/* Sheen and edge, so the flat stripes read as cloth. */}
      <rect x={0} y={0} width={W} height={H * 0.45} fill="#fff" opacity={0.1} />
      <rect x={0} y={H * 0.75} width={W} height={H * 0.25} fill="#000" opacity={0.14} />
      <rect x={0.2} y={0.2} width={W - 0.4} height={H - 0.4} fill="none" stroke="#000" strokeOpacity={0.55} strokeWidth={0.4} />
      <Devices marks={deviceMarks(device, count)} />
    </svg>
  );
}
