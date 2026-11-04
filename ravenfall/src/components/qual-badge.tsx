import { badgeCode, badgeColor, shapeOf, type BadgeShape } from "@/lib/qual-rules";
import { cn } from "@/lib/utils";

// A qualification's skill badge: a shape in its colour with its letters,
// drawn like the squad emblems (40x40, no images). Expired badges are greyed.

const PATH: Record<BadgeShape, string> = {
  TAB: "M3,11 L37,11 L37,29 L3,29 Z",
  SHIELD: "M6,4 L34,4 L34,20 C34,28 27,34 20,37 C13,34 6,28 6,20 Z",
  ROUND: "M20,3 A17,17 0 1 1 19.99,3 Z",
  WINGS: "M20,12 C26,6 33,6 39,9 C36,14 34,20 28,24 C25,26 22,27 20,30 C18,27 15,26 12,24 C6,20 4,14 1,9 C7,6 14,6 20,12 Z",
  CROSS: "M14,3 L26,3 L26,14 L37,14 L37,26 L26,26 L26,37 L14,37 L14,26 L3,26 L3,14 L14,14 Z",
};

export type BadgeLike = { title: string; category: string; badgeShape: string; badgeColor: string | null; badgeCode: string };

export function QualBadge({ q, size = 28, expired, label, className }: { q: BadgeLike; size?: number; expired?: boolean; label?: string; className?: string }) {
  const shape = shapeOf(q.badgeShape);
  const color = expired ? "#6b7280" : badgeColor(q);
  const text = badgeCode(q);
  const y = shape === "WINGS" ? 22 : shape === "SHIELD" ? 23 : 24.5;
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", expired && "opacity-60", className)}
    >
      <path d={PATH[shape]} fill={color} stroke="#000" strokeOpacity={0.35} strokeWidth={1.5} strokeLinejoin="round" />
      <path d={PATH[shape]} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={0.75} strokeLinejoin="round" transform="translate(20 20) scale(0.86) translate(-20 -20)" />
      <text
        x={20}
        y={y}
        textAnchor="middle"
        fontSize={text.length > 3 ? 9 : text.length > 2 ? 11 : 13}
        fontWeight={800}
        fill="#fff"
        style={{ fontFamily: "var(--font-heading), ui-sans-serif, system-ui, sans-serif", letterSpacing: "0.04em" }}
      >
        {text}
      </text>
    </svg>
  );
}
