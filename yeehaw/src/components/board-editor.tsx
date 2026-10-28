"use client";

import { Loader2, X } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { Bench, Pitch, type SlotEdit } from "@/components/pitch";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { POSITION_LABEL } from "@/config/club";
import type { BoardPlayer, BoardSlots } from "@/lib/board";
import { carryOver, MAX_NAME, placeItem, removeItem, type SlotMap } from "@/lib/lineup-rules";
import { cn } from "@/lib/utils";

// The editable board, shared by the lineup editor and the tactics board:
// formation picker, pitch, bench and the roster to place from. Tap a name then
// a slot (works on a phone), or drag. Tap a placed player to pick them up and
// tap another slot to move or swap. All the placing rules live in
// lib/lineup-rules.ts; the server re-checks everything on save.

export type SaveOutcome = { ok: true; message?: string } | { ok: false; errors: string[] };
export type BoardAction = { intent: string; label: string; variant?: "default" | "outline" | "secondary"; confirm?: string };

type Props = {
  formations: string[];
  initialFormation: string;
  /** Saved slots per formation. The lineup passes just its own formation. */
  initialSlots: Record<string, SlotMap>;
  /** true: each formation keeps its own placements (tactics). false: placements follow you across formations (lineup). */
  remember: boolean;
  roster: BoardPlayer[];
  /** Tactics only: free-text names (EA gamertags with no file) and a box to add more. */
  allowNames?: boolean;
  nameSuggestions?: string[];
  actions: BoardAction[];
  onSave: (input: { formation: string; slots: SlotMap; intent: string }) => Promise<SaveOutcome>;
  rosterTitle?: string;
  emptyRosterText?: string;
};

const nameKey = (n: string) => `n:${n}`;

export function BoardEditor({ formations, initialFormation, initialSlots, remember, roster, allowNames, nameSuggestions = [], actions, onSave, rosterTitle = "Squad", emptyRosterText = "Everyone is placed." }: Props) {
  const [formation, setFormation] = useState(initialFormation);
  const [sets, setSets] = useState<Record<string, SlotMap>>(initialSlots);
  const [selected, setSelected] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>(() => {
    if (!allowNames) return [];
    const fromSlots = Object.values(initialSlots).flatMap((m) => Object.values(m).filter((v) => v.startsWith("n:")).map((v) => v.slice(2)));
    return [...new Set([...fromSlots, ...nameSuggestions])];
  });
  const [draftName, setDraftName] = useState("");
  const [filter, setFilter] = useState("");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [pending, start] = useTransition();
  const dragging = useRef<string | null>(null);

  const slots = sets[formation] ?? {};
  const setSlots = (next: SlotMap) => {
    setSets((s) => ({ ...s, [formation]: next }));
    setDirty(true);
    setMsg(null);
  };

  const items = useMemo(() => {
    const m = new Map<string, BoardPlayer>(roster.map((p) => [p.key, p]));
    for (const n of names) m.set(nameKey(n), { key: nameKey(n), name: n, discordId: "0", avatar: null });
    return m;
  }, [roster, names]);
  const lookup = (key: string): BoardPlayer => items.get(key) ?? { key, name: "Not in squad", discordId: "0", avatar: null };

  const board: BoardSlots = Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, lookup(v)]));
  const placed = new Set(Object.values(slots));
  const q = filter.trim().toLowerCase();
  const available = [...items.values()].filter((p) => !placed.has(p.key) && (!q || p.name.toLowerCase().includes(q)));
  const selectedPlaced = selected != null && placed.has(selected);

  const edit: SlotEdit = {
    selected,
    onSlot: (key) => {
      if (selected) {
        setSlots(placeItem(slots, selected, key));
        setSelected(null);
      } else if (slots[key]) setSelected(slots[key]);
    },
    onDragStart: (_, item) => {
      dragging.current = item;
      setSelected(null);
    },
    onDrop: (key) => {
      if (dragging.current) setSlots(placeItem(slots, dragging.current, key));
      dragging.current = null;
    },
    onDragEnd: () => {
      dragging.current = null;
    },
  };

  function changeFormation(next: string) {
    if (!remember) setSets((s) => ({ ...s, [next]: carryOver(s[formation] ?? {}, next) }));
    setFormation(next);
    setSelected(null);
    setDirty(true);
    setMsg(null);
  }

  function addName() {
    const n = draftName.trim().slice(0, MAX_NAME);
    if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) setNames([...names, n]);
    setDraftName("");
  }

  function run(a: BoardAction) {
    if (a.confirm && !window.confirm(a.confirm)) return;
    start(async () => {
      try {
        const r = await onSave({ formation, slots, intent: a.intent });
        if (r.ok) {
          setDirty(false);
          setMsg({ ok: true, lines: [r.message ?? "Saved."] });
        } else setMsg({ ok: false, lines: r.errors });
      } catch {
        setMsg({ ok: false, lines: ["That didn't save. Check your connection or permissions and try again."] });
      }
    });
  }

  const pick = selected ? lookup(selected) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="field-label">Formation</span>
          <Select value={formation} onChange={(e) => changeFormation(e.target.value)} className="w-36">
            {formations.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </label>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.intent} variant={a.variant ?? "default"} disabled={pending} onClick={() => run(a)} aria-busy={pending || undefined}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} {a.label}
            </Button>
          ))}
          <Button variant="ghost" disabled={pending || !Object.keys(slots).length} onClick={() => { setSlots({}); setSelected(null); }}>
            Clear board
          </Button>
        </div>
        {dirty && <span className="pb-2 text-xs text-warning">Unsaved changes</span>}
      </div>

      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={cn("rounded border px-3 py-2 text-sm", msg.ok ? "border-success/40 bg-success/10 text-success-fg" : "border-destructive/50 bg-destructive/10 text-destructive-fg")}>
          {msg.lines.length > 1 ? (
            <ul className="list-disc pl-4">
              {msg.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : (
            msg.lines[0]
          )}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <p className="min-h-6 text-sm text-muted-foreground" aria-live="polite">
            {pick ? (
              <>
                <strong className="text-foreground">{pick.name}</strong> is picked up. Tap a slot to {selectedPlaced ? "move or swap" : "place"}.{" "}
                <button type="button" className="text-accent underline underline-offset-2" onClick={() => setSelected(null)}>
                  Cancel
                </button>
                {selectedPlaced && (
                  <>
                    {" · "}
                    <button type="button" className="text-accent underline underline-offset-2" onClick={() => { setSlots(removeItem(slots, selected!)); setSelected(null); }}>
                      Take off the board
                    </button>
                  </>
                )}
              </>
            ) : (
              "Tap a name, then a slot, or drag. Tap a placed player to move or swap them."
            )}
          </p>
          <Pitch formation={formation} slots={board} edit={edit} />
          <section>
            <h3 className="field-label mb-2">Substitutes bench</h3>
            <div className="rounded-lg border bg-card p-3">
              <Bench formation={formation} slots={board} edit={edit} />
            </div>
          </section>
        </div>

        <section
          className="rounded-lg border bg-card p-3 lg:sticky lg:top-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging.current) setSlots(removeItem(slots, dragging.current));
            dragging.current = null;
          }}
        >
          <h3 className="field-label mb-2">{rosterTitle} ({available.length} to place)</h3>
          {items.size > 10 && <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a name" aria-label="Find a name" className="mb-2" />}
          {allowNames && (
            <form
              className="mb-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addName();
              }}
            >
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={MAX_NAME} placeholder="Add a name (e.g. gamertag)" aria-label="Add a free-text name" />
              <Button type="submit" variant="secondary" size="sm">
                Add
              </Button>
            </form>
          )}
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">{items.size ? emptyRosterText : "Nobody is under contract yet."}</p>
          ) : (
            <ul className="grid max-h-[28rem] grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-1">
              {available.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    draggable
                    aria-pressed={selected === p.key}
                    onClick={() => setSelected(selected === p.key ? null : p.key)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", p.key);
                      e.dataTransfer.effectAllowed = "move";
                      dragging.current = p.key;
                      setSelected(null);
                    }}
                    onDragEnd={() => (dragging.current = null)}
                    className={cn(
                      "flex min-h-11 w-full touch-manipulation items-center gap-2 rounded-md border px-2 py-1 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected === p.key ? "border-white bg-secondary" : "border-border",
                    )}
                  >
                    <Avatar discordId={p.discordId} avatar={p.avatar} name={p.name} size={28} className="rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      {(p.hint || p.position || p.slug === undefined) && <span className="block truncate text-xs text-muted-foreground">{p.hint ?? (p.position ? POSITION_LABEL[p.position] : "Name only")}</span>}
                    </span>
                    {p.number != null && <span className="tnum font-display text-sm font-bold text-accent">#{p.number}</span>}
                    {p.captaincy && p.captaincy !== "NONE" && <span className="rounded-sm bg-warning px-1 text-[0.65rem] font-extrabold text-black">{p.captaincy === "CAPTAIN" ? "C" : "V"}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedPlaced && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <X aria-hidden className="size-3" /> Drop a placed player here to take them off.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
