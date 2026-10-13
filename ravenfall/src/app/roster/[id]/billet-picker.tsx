"use client";

import { Check, Lock } from "lucide-react";
import { useState } from "react";
import { SubmitButton } from "@/components/action-form";
import { Field, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requestRole } from "../../personnel/actions";
import { RequestForm } from "./request-form";

export type PickerSquad = { name: string; callsign: string; billets: { role: string; cap: number; filled: number }[] };
export type PickerRole = { name: string; code: string; blurb: string; missing: string[] };

// Pick a squad, click an open billet for the primary role, toggle up to
// `maxSecondary` secondaries, give a reason. Locked and full billets show
// why, so a member can see what training opens which seat.
export function BilletPicker({
  squads,
  roles,
  current,
  initial,
  maxSecondary,
  pending,
}: {
  squads: PickerSquad[];
  roles: PickerRole[];
  current: { squad: string | null; primary: string | null; secondary: string[] };
  initial?: { squad?: string; role?: string };
  maxSecondary: number;
  pending: boolean;
}) {
  const startSquad = squads.find((s) => s.name === initial?.squad)?.name ?? current.squad ?? squads[0]?.name ?? "";
  const [squad, setSquad] = useState(startSquad);
  const [primary, setPrimary] = useState<string | null>(
    initial?.role && initial.squad === startSquad ? initial.role : startSquad === current.squad ? current.primary : null,
  );
  const [secondary, setSecondary] = useState<string[]>(current.secondary);
  const role = (n: string) => roles.find((r) => r.name === n);
  const sq = squads.find((s) => s.name === squad);

  function pickSquad(name: string) {
    setSquad(name);
    setPrimary(name === current.squad ? current.primary : null);
  }

  function toggleSecondary(name: string) {
    setSecondary((s) => (s.includes(name) ? s.filter((x) => x !== name) : s.length < maxSecondary ? [...s, name] : s));
  }

  return (
    <RequestForm
      action={requestRole}
      pending={pending}
      pendingNote={
        <>
          You have a billet request with leadership. Withdraw it under <b>Requests</b> to file a different one.
        </>
      }
    >
      <input type="hidden" name="squad" value={squad} />
      <input type="hidden" name="primary" value={primary ?? ""} />
      {secondary
        .filter((s) => s !== primary)
        .map((s) => (
          <input key={s} type="hidden" name="secondary" value={s} />
        ))}

      <div>
        <div className="field-label mb-2">1 · Element</div>
        <div className="flex flex-wrap gap-1.5">
          {squads.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => pickSquad(s.name)}
              aria-pressed={s.name === squad}
              className={cn(
                "rounded-sm border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider",
                s.name === squad ? "border-accent bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.name}
              {s.name === current.squad && <span className="ml-1.5 opacity-60">(current)</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="field-label mb-2">2 · Primary billet</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {sq?.billets.map((b) => {
            const r = role(b.role);
            const mine = current.squad === squad && current.primary === b.role;
            const open = b.cap - b.filled + (mine ? 1 : 0);
            const locked = !!r?.missing.length;
            const full = open <= 0;
            const on = primary === b.role;
            return (
              <button
                key={b.role}
                type="button"
                disabled={locked || full}
                onClick={() => setPrimary(b.role)}
                aria-pressed={on}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
                  on ? "border-accent bg-accent/10" : "bg-background/40 hover:border-foreground/40",
                  (locked || full) && "cursor-not-allowed opacity-55 hover:border-border",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-semibold">{b.role}</span>
                  <span className="typed text-[11px] text-muted-foreground">{r?.code}</span>
                </div>
                {/* Slot pips: filled, open. */}
                <div className="flex gap-1" aria-label={`${b.filled} of ${b.cap} filled`}>
                  {Array.from({ length: b.cap }, (_, i) => (
                    <span key={i} className={cn("h-1.5 w-4 rounded-[1px]", i < b.filled ? "bg-foreground/60" : "border border-foreground/30")} />
                  ))}
                </div>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {mine ? (
                    <span className="text-green-300">Your billet</span>
                  ) : locked ? (
                    <span className="flex items-center gap-1">
                      <Lock className="size-3" /> Needs {r!.missing.join(", ")}
                    </span>
                  ) : full ? (
                    "Full"
                  ) : (
                    `${open} open`
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="field-label mb-2">
          3 · Secondary roles <span className="normal-case tracking-normal">(up to {maxSecondary})</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {roles
            .filter((r) => r.name !== primary)
            .map((r) => {
              const on = secondary.includes(r.name);
              const locked = r.missing.length > 0;
              return (
                <button
                  key={r.name}
                  type="button"
                  disabled={locked || (!on && secondary.filter((s) => s !== primary).length >= maxSecondary)}
                  onClick={() => toggleSecondary(r.name)}
                  aria-pressed={on}
                  title={locked ? `Needs ${r.missing.join(", ")}` : r.blurb}
                  className={cn(
                    "flex items-center gap-1 rounded-sm border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-45",
                    on ? "border-sky-400/60 bg-sky-400/10 text-sky-300" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on ? <Check className="size-3" /> : locked ? <Lock className="size-3" /> : null}
                  {r.name}
                </button>
              );
            })}
        </div>
      </div>

      <Field label="4 · Justification (optional)" htmlFor="reason">
        <Textarea id="reason" name="reason" maxLength={500} className="min-h-16" placeholder="Why this billet? Relevant experience, availability…" />
      </Field>
      <SubmitButton variant="accent" size="sm" className="self-start" disabled={!primary}>
        Submit billet request
      </SubmitButton>
    </RequestForm>
  );
}
