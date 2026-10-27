import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { POSITION_LABEL } from "@/config/club";
import type { LiveEntry } from "@/lib/squad";

const positions = (e: Pick<LiveEntry, "position" | "secondaryPosition">) =>
  [e.position, e.secondaryPosition].filter((p): p is NonNullable<typeof p> => !!p).map((p) => POSITION_LABEL[p]).join(" / ");

/** A squad member as a card: number, avatar, name, positions, armband. Links to their hub. */
export function SquadCard({ entry: e }: { entry: LiveEntry }) {
  return (
    <Link
      href={`/players/${e.slug}`}
      className="group relative flex items-center gap-3 overflow-hidden rounded-lg border bg-card p-3 transition-colors hover:border-input hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {e.shirtNumber != null && (
        <span aria-hidden className="tnum pointer-events-none absolute -right-1 -top-3 font-display text-6xl font-extrabold text-white/[0.05]">
          {e.shirtNumber}
        </span>
      )}
      <Avatar discordId={e.discordId} avatar={e.avatar} name={e.gamertag ?? e.name} size={48} className="size-12 rounded-full" />
      <span className="relative min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {e.shirtNumber != null && <span className="tnum font-display text-sm font-bold text-accent">#{e.shirtNumber}</span>}
          <span className="truncate font-semibold group-hover:underline">{e.name}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{positions(e) || "Position to be confirmed"}</span>
      </span>
      {e.captaincy !== "NONE" && <Badge variant="warning">{e.captaincy === "CAPTAIN" ? "Captain" : "Vice"}</Badge>}
    </Link>
  );
}
