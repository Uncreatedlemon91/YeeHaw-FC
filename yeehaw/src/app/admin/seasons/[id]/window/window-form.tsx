"use client";

import { Send, X } from "lucide-react";
import { useActionState, useState } from "react";
import { FormMessage, SubmitButton, type ActionState } from "@/components/action-form";
import { TermsFields, type TermsDefaults } from "@/components/contract-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/input";

export type WindowRow = {
  playerId: string;
  name: string;
  /** "Last season: #7, Starter" or "New to the squad". */
  note: string;
  previousContractId: string | null;
  defaults: TermsDefaults;
};

type Props = {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  rows: WindowRow[];
  /** Members who can be added to the batch. */
  people: { id: string; name: string }[];
};

/**
 * The re-signing sheet: one card per player with last season's terms
 * prefilled. Untick to let someone go; add other members below; Send offers
 * posts them all at once (or none, if any row breaks a rule).
 */
export function WindowForm({ action, rows, people }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  const [added, setAdded] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const extra = added.map((id) => people.find((p) => p.id === id)).filter((p): p is { id: string; name: string } => !!p);
  const addable = people.filter((p) => !added.includes(p.id) && !rows.some((r) => r.playerId === p.id));
  const all: WindowRow[] = [
    ...rows,
    ...extra.map((p) => ({ playerId: p.id, name: p.name, note: "Added by you", previousContractId: null, defaults: {} })),
  ];
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {all.length === 0 && <p className="text-sm text-muted-foreground">Nobody to re-sign. Add a member below.</p>}
      {all.map((r) => (
        <Card key={r.playerId}>
          <CardContent className="flex flex-col gap-3">
            <input type="hidden" name="row" value={r.playerId} />
            <input type="hidden" name={`${r.playerId}:prev`} value={r.previousContractId ?? ""} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" name={`offer:${r.playerId}`} value="1" defaultChecked className="size-4 accent-[var(--primary)]" />
                Offer {r.name}
              </label>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {r.note}
                {added.includes(r.playerId) && (
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => setAdded(added.filter((x) => x !== r.playerId))}>
                    <X />
                  </Button>
                )}
              </span>
            </div>
            <TermsFields prefix={`${r.playerId}:`} defaults={r.defaults} errors={err} />
          </CardContent>
        </Card>
      ))}

      {addable.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Add another member
            <Select value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-56">
              <option value="">Choose…</option>
              {addable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={!pick}
            onClick={() => {
              setAdded([...added, pick]);
              setPick("");
            }}
          >
            Add to the sheet
          </Button>
        </div>
      )}

      <FormMessage state={state} />
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur">
        <SubmitButton pendingText="Sending…" disabled={all.length === 0}>
          <Send /> Send offers
        </SubmitButton>
        <span className="text-xs text-muted-foreground">Each ticked player gets their offer in Discord with Accept and Decline buttons.</span>
      </div>
    </form>
  );
}
