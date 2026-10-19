import { squadDef } from "@/config/unit";
import { cn } from "@/lib/utils";

// A simple SVG emblem per element, drawn like insignia.tsx (40x40 viewBox,
// currentColor line work). The outline shape follows the squad name; the
// letters are its initials. Unknown squads fall back to a round badge.

type Outline = "crest" | "diamond" | "hex" | "round" | "pennant" | "shield";

const SHAPE: Record<string, Outline> = {
  Command: "crest",
  Alpha: "shield",
  Bravo: "hex",
  Charlie: "diamond",
  Reaper: "pennant",
  Medical: "round",
};

const PATH: Record<Outline, string> = {
  crest: "M20,3 L35,9 L35,22 C35,30 28,35 20,38 C12,35 5,30 5,22 L5,9 Z",
  shield: "M6,5 L34,5 L34,21 C34,29 27,35 20,38 C13,35 6,29 6,21 Z",
  hex: "M20,3 L34,11 L34,29 L20,37 L6,29 L6,11 Z",
  diamond: "M20,2 L38,20 L20,38 L2,20 Z",
  pennant: "M5,4 L35,4 L35,24 L20,36 L5,24 Z",
  round: "M20,3 A17,17 0 1 1 19.99,3 Z",
};

export function squadInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

/**
 * `name` is the squad's name as stored on a member (src/config/unit.ts
 * SQUADS[].name). `size` is the rendered px width/height (default 32).
 * Decorative by default (aria-hidden); pass `label` to expose it as an image.
 */
export function SquadEmblem({
  name,
  size = 32,
  label,
  className,
}: {
  name: string | null | undefined;
  size?: number;
  label?: string;
  className?: string;
}) {
  const def = squadDef(name);
  const shape = def ? (SHAPE[def.name] ?? "round") : "round";
  const text = squadInitials(def?.name ?? name ?? "?");
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0 text-accent", className)}
    >
      <path d={PATH[shape]} fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <text
        x={20}
        y={shape === "pennant" ? 19 : 24.5}
        textAnchor="middle"
        fontSize={text.length > 1 ? 13 : 16}
        fontWeight={800}
        fill="currentColor"
        style={{ fontFamily: "var(--font-heading), ui-sans-serif, system-ui, sans-serif", letterSpacing: "0.02em" }}
      >
        {text}
      </text>
    </svg>
  );
}
