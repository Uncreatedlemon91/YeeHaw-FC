"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Bench, Pitch, type SlotEdit } from "@/components/pitch";
import type { BoardSlots } from "@/lib/board";
import { slotLabel } from "@/lib/lineup-rules";
import { cn } from "@/lib/utils";

/**
 * The sign-up sheet for an event with a formation: the pitch and bench show
 * who has taken each position; tap an empty one to take it, tap yours to give
 * it up. The server decides (one player per position, sign-ups open): this
 * only shows what it said. Without `canSign` the same pitch is read-only and
 * each name links to the player's hub.
 */
export function SlotSignup({
  formation,
  slots,
  mySlot,
  canSign,
  claim,
}: {
  formation: string;
  slots: BoardSlots;
  mySlot: string | null;
  canSign: boolean;
  /** Server action: take a slot, or give up (empty key). */
  claim: (slotKey: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const press = (key: string) => {
    const holder = slots[key];
    if (holder && key !== mySlot) {
      setMsg({ ok: false, text: `${slotLabel(formation, key)} is taken by ${holder.name}.` });
      return;
    }
    start(async () => {
      try {
        const r = await claim(key === mySlot ? "" : key);
        setMsg({ ok: r.ok, text: r.message });
      } catch {
        setMsg({ ok: false, text: "That didn't save. Check your connection and try again." });
      }
    });
  };

  const edit: SlotEdit | undefined = canSign
    ? { selected: null, onSlot: press, onDragStart: () => {}, onDrop: () => {}, onDragEnd: () => {} }
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      {canSign && (
        <p className="min-h-6 text-sm text-muted-foreground" aria-live="polite">
          {pending ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
            </span>
          ) : msg ? (
            <span className={cn(msg.ok ? "text-success-fg" : "text-destructive-fg")}>{msg.text}</span>
          ) : mySlot ? (
            `You're at ${slotLabel(formation, mySlot)}. Tap another open position to move, or yours to give it up.`
          ) : (
            "Tap an open position to sign up for it."
          )}
        </p>
      )}
      <Pitch formation={formation} slots={slots} edit={edit} />
      <section>
        <h3 className="field-label mb-2">Substitutes bench</h3>
        <div className="rounded-lg border bg-card p-3">
          <Bench formation={formation} slots={slots} edit={edit} />
        </div>
      </section>
    </div>
  );
}
