import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { BENCH_SLOT_KEYS, FORMATIONS } from "@/config/formations";
import type { BoardPlayer, BoardSlots } from "@/lib/board";
import { cn } from "@/lib/utils";

// The pitch, the bench and a player token: one set of pieces for the Squad
// page, the home page, the lineup editor and the tactics board. Pure drawing:
// with no `edit` prop every filled slot links to the player's hub; with it
// (from the editors) each slot is a button that takes drops and taps.

export type SlotEdit = {
  /** Item key currently picked up (tap-to-place), highlighted. */
  selected: string | null;
  onSlot: (slotKey: string) => void;
  onDragStart: (slotKey: string, item: string) => void;
  onDrop: (slotKey: string) => void;
  onDragEnd: () => void;
};

type Size = "sm" | "md";

/** Grass, mowing stripes and markings, drawn once as an SVG that scales with the pitch. */
function Markings() {
  return (
    <svg viewBox="0 0 68 104" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full">
      <defs>
        <linearGradient id="pitch-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#17432a" />
          <stop offset="1" stopColor="#0f2f1c" />
        </linearGradient>
      </defs>
      <rect width="68" height="104" fill="url(#pitch-grass)" />
      {[0, 2, 4, 6, 8].map((i) => (
        <rect key={i} y={i * 10.4} width="68" height="10.4" fill="#fff" opacity="0.025" />
      ))}
      <g fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="0.45" vectorEffect="non-scaling-stroke">
        <rect x="3" y="3" width="62" height="98" />
        <line x1="3" y1="52" x2="65" y2="52" />
        <circle cx="34" cy="52" r="8.5" />
        <rect x="14" y="3" width="40" height="15.5" />
        <rect x="24" y="3" width="20" height="5.5" />
        <path d="M 27.5 18.5 A 8.5 8.5 0 0 0 40.5 18.5" />
        <rect x="14" y="85.5" width="40" height="15.5" />
        <rect x="24" y="95.5" width="20" height="5.5" />
        <path d="M 27.5 85.5 A 8.5 8.5 0 0 1 40.5 85.5" />
      </g>
      <g fill="#fff" fillOpacity="0.3">
        <circle cx="34" cy="52" r="0.6" />
        <circle cx="34" cy="13" r="0.5" />
        <circle cx="34" cy="91" r="0.5" />
      </g>
    </svg>
  );
}

/**
 * Formation tops are percentages of the old 100-high pitch with the slot's
 * CENTRE at that point. Here the avatar's centre sits on the point (name
 * hangs below) and outfield tops are squeezed a little so a deep sweeper and
 * the keeper never touch on a phone-width pitch; the keeper stays near the line.
 */
const slotTop = (key: string, top: number) => (key === "GK" ? 89 : 3 + top * 0.84);

const AV: Record<Size, number> = { sm: 36, md: 44 };

/** Avatar with number badge and armband, name under it; a dashed ring when the slot is empty. */
export function Token({ player, size = "md", label, highlight }: { player: BoardPlayer | null | undefined; size?: Size; label: string; highlight?: boolean }) {
  const px = AV[size];
  if (!player) {
    return (
      <span
        style={{ width: px, height: px }}
        className={cn(
          "flex items-center justify-center rounded-full border-2 border-dashed font-mono text-micro font-bold uppercase text-white/70",
          highlight ? "border-white bg-white/20" : "border-white/35 bg-black/15",
        )}
      >
        {label}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="relative">
        <Avatar
          discordId={player.discordId}
          avatar={player.avatar}
          name={player.name}
          size={px}
          className={cn("rounded-full border-2 shadow-md shadow-black/50", highlight ? "border-white ring-2 ring-white/70" : "border-white/80")}
        />
        {player.number != null && (
          <span className="tnum absolute -bottom-1 -left-1.5 flex min-w-[1.15rem] items-center justify-center rounded-full border border-white/70 bg-primary px-1 text-[0.65rem] font-bold leading-[1.1rem] text-white shadow">
            {player.number}
          </span>
        )}
        {player.captaincy && player.captaincy !== "NONE" && (
          <span
            title={player.captaincy === "CAPTAIN" ? "Captain" : "Vice-captain"}
            className="absolute -right-1.5 -top-1 flex size-[1.1rem] items-center justify-center rounded-sm border border-black/40 bg-warning text-[0.6rem] font-extrabold leading-none text-black shadow"
          >
            {player.captaincy === "CAPTAIN" ? "C" : "V"}
          </span>
        )}
      </span>
      <span className="max-w-[4.25rem] truncate rounded-sm bg-black/65 px-1.5 py-px text-center text-[0.65rem] font-semibold leading-4 text-white sm:max-w-[5.5rem] sm:text-xs">{player.name}</span>
    </span>
  );
}

function SlotShell({
  slotKey,
  label,
  player,
  edit,
  size,
  className,
  style,
}: {
  slotKey: string;
  label: string;
  player: BoardPlayer | null | undefined;
  edit?: SlotEdit;
  size: Size;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!edit) {
    const inner = <Token player={player} size={size} label={label} />;
    return player?.slug ? (
      <Link href={`/players/${player.slug}`} style={style} className={cn("rounded-md outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring", className)}>
        {inner}
      </Link>
    ) : (
      <div style={style} className={className}>
        {inner}
      </div>
    );
  }
  const picked = !!player && edit.selected === player.key;
  return (
    <button
      type="button"
      draggable={!!player}
      style={style}
      aria-pressed={picked}
      aria-label={
        player
          ? `${label}: ${player.name}. ${picked ? "Picked up." : "Activate to pick up or swap."}`
          : `${label}: empty.${edit.selected ? " Activate to place the picked player." : ""}`
      }
      onClick={() => edit.onSlot(slotKey)}
      onDragStart={(e) => {
        if (!player) return;
        e.dataTransfer.setData("text/plain", player.key);
        e.dataTransfer.effectAllowed = "move";
        edit.onDragStart(slotKey, player.key);
      }}
      onDragEnd={edit.onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        edit.onDrop(slotKey);
      }}
      className={cn("touch-manipulation rounded-md p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <Token player={player} size={size} label={label} highlight={picked || (!player && !!edit.selected)} />
    </button>
  );
}

export function Pitch({ formation, slots, edit, className }: { formation: string; slots: BoardSlots; edit?: SlotEdit; className?: string }) {
  const layout = FORMATIONS[formation] ?? {};
  return (
    <div
      role="group"
      aria-label={`Pitch, ${formation}`}
      className={cn("relative mx-auto aspect-[68/104] w-full max-w-[30rem] overflow-hidden rounded-lg border border-white/15 shadow-xl shadow-black/40", className)}
    >
      <Markings />
      {Object.entries(layout).map(([key, def]) => (
        <SlotShell
          key={key}
          slotKey={key}
          label={def.label}
          player={slots[key]}
          edit={edit}
          size="md"
          className="absolute -translate-x-1/2 -translate-y-[24px] p-0.5"
          style={{ top: `${slotTop(key, def.top)}%`, left: `${def.left}%` }}
        />
      ))}
    </div>
  );
}

/** The seven bench slots. `hideEmpty` for the public view. */
export function Bench({ formation, slots, edit, hideEmpty }: { formation: string; slots: BoardSlots; edit?: SlotEdit; hideEmpty?: boolean }) {
  const keys = BENCH_SLOT_KEYS.filter((k) => !hideEmpty || slots[k]);
  if (!keys.length) return <p className="text-sm text-muted-foreground">No substitutes named.</p>;
  return (
    <div className="grid grid-cols-4 gap-x-1 gap-y-3 sm:grid-cols-7">
      {keys.map((k) => (
        <SlotShell key={k} slotKey={k} label={k} player={slots[k]} edit={edit} size="sm" className="mx-auto" />
      ))}
    </div>
  );
}
