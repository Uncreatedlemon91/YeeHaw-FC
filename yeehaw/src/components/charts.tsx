// Small dependency-free SVG charts for the Stats page (port of the old
// proclubs/static/js/charts.js, which was the same idea: no chart library).
// Server components: they draw from numbers and ship no JavaScript. Colours
// are the site's tokens so the charts follow the palette. Each chart is an
// img with a text summary, and each mark carries a <title> for hover.

const W = 640;
const H = 180;
const PAD = { l: 36, r: 10, t: 10, b: 22 };

const scale = (v: number, lo: number, hi: number, a: number, b: number) => (hi === lo ? (a + b) / 2 : a + ((v - lo) / (hi - lo)) * (b - a));

export type Point = { label: string; value: number };

/** A line (with a soft fill) of values over time; the y-axis is padded to the data, not forced to zero. */
export function TrendChart({ points, title, unit = "", summary }: { points: readonly Point[]; title: string; unit?: string; summary: string }) {
  if (points.length < 2) return <p className="text-sm text-muted-foreground">Not enough history yet: the chart appears after a few polls.</p>;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max(1, (hi - lo) * 0.15);
  const y = (v: number) => scale(v, lo - pad, hi + pad, H - PAD.b, PAD.t);
  const x = (i: number) => scale(i, 0, points.length - 1, PAD.l, W - PAD.r);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z`;
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`} className="h-auto w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
          <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
            {t}
          </text>
        </g>
      ))}
      <path d={area} fill="var(--accent)" opacity="0.12" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={points.length > 60 ? 0 : 3} fill="var(--accent)">
          <title>{`${p.label}: ${p.value}${unit}`}</title>
        </circle>
      ))}
      <text x={PAD.l} y={H - 5} fontSize="10" fill="var(--muted-foreground)">
        {points[0].label}
      </text>
      <text x={W - PAD.r} y={H - 5} fontSize="10" textAnchor="end" fill="var(--muted-foreground)">
        {points[points.length - 1].label}
      </text>
    </svg>
  );
}

/** One bar per match: up for a positive value (green), down for negative (red), a short stub for zero. */
export function DivergingBars({ points, title, summary }: { points: readonly Point[]; title: string; summary: string }) {
  if (!points.length) return <p className="text-sm text-muted-foreground">No matches recorded yet.</p>;
  const max = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  const mid = (H - PAD.b + PAD.t) / 2;
  const half = (H - PAD.b - PAD.t) / 2;
  const slot = (W - PAD.l - PAD.r) / points.length;
  const bar = Math.min(18, slot * 0.7);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`} className="h-auto w-full">
      <line x1={PAD.l} x2={W - PAD.r} y1={mid} y2={mid} stroke="var(--border)" />
      <text x={PAD.l - 6} y={mid + 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
        0
      </text>
      {points.map((p, i) => {
        const h = Math.max(2, (Math.abs(p.value) / max) * half);
        const cx = PAD.l + slot * i + slot / 2;
        return (
          <rect key={i} x={cx - bar / 2} y={p.value >= 0 ? mid - h : mid} width={bar} height={h} rx="1" fill={p.value > 0 ? "var(--success)" : p.value < 0 ? "var(--destructive)" : "var(--muted-foreground)"}>
            <title>{`${p.label}: ${p.value > 0 ? "+" : ""}${p.value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** A row of coloured result chips: W green, D grey, L red. Letters, not colour alone. */
export function FormStrip({ form, label = "Recent results, oldest to newest" }: { form: readonly ("W" | "L" | "D")[]; label?: string }) {
  if (!form.length) return <span className="text-muted-foreground">-</span>;
  const cls = { W: "bg-success text-white", L: "bg-destructive text-destructive-foreground", D: "bg-secondary text-secondary-foreground" } as const;
  return (
    <span className="inline-flex gap-1" role="group" aria-label={label}>
      {form.map((o, i) => (
        <span key={i} className={`inline-flex size-5 items-center justify-center rounded-sm text-[0.65rem] font-bold ${cls[o]}`}>
          {o}
        </span>
      ))}
    </span>
  );
}

/** A tiny line of recent values (ratings) with no axes. */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  if (values.length < 2) return <span className="text-muted-foreground">-</span>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => scale(i, 0, values.length - 1, 2, 78);
  const y = (v: number) => scale(v, lo, hi, 18, 2);
  return (
    <svg viewBox="0 0 80 20" role="img" aria-label={label} className="h-5 w-20">
      <path d={values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}
