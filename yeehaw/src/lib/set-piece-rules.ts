import { SET_PIECE_KINDS, SET_PIECE_SIDES } from "@/config/club";

// Set-piece form rules (port of proclubs/setpieces.py save()).

export type SetPieceInput = { name: string; kind: string; side: string; takerId: string; routine: string; targets: string };
export type SetPieceClean = { name: string; kind: string; side: string | null; takerId: string | null; routine: string | null; targets: string | null };

export function parseSetPiece(i: SetPieceInput): { ok: true; value: SetPieceClean } | { ok: false; error: string; field: string } {
  const name = i.name.trim();
  if (!name) return { ok: false, field: "name", error: "Name the routine." };
  if (name.length > 60) return { ok: false, field: "name", error: "Keep the name under 60 characters." };
  if (!(SET_PIECE_KINDS as readonly string[]).includes(i.kind)) return { ok: false, field: "kind", error: "Pick what kind of set piece it is." };
  if (i.side && !(SET_PIECE_SIDES as readonly string[]).includes(i.side)) return { ok: false, field: "side", error: "Pick a side from the list." };
  const routine = i.routine.trim();
  const targets = i.targets.trim();
  if (routine.length > 1500) return { ok: false, field: "routine", error: "Keep the routine under 1,500 characters." };
  if (targets.length > 200) return { ok: false, field: "targets", error: "Keep the targets under 200 characters." };
  return { ok: true, value: { name, kind: i.kind, side: i.side || null, takerId: i.takerId || null, routine: routine || null, targets: targets || null } };
}
