"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Ribbon } from "@/components/ribbon";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/input";
import type { Stripe } from "@/lib/awards";
import { nominate } from "@/app/personnel/award-actions";

type AwardOption = { id: string; name: string; description: string; device: "NONE" | "OAK_LEAF" | "STAR" | "NUMERAL"; stripes: Stripe[]; blocked: string | null };

/** Pick an award (with its ribbon beside it), write the citation, optionally tie it to an op. */
export function NominateForm({ nomineeId, awards, events }: { nomineeId: string; awards: AwardOption[]; events: { id: string; label: string }[] }) {
  const [awardId, setAwardId] = useState("");
  const picked = awards.find((a) => a.id === awardId);
  return (
    <ActionForm action={nominate}>
      <input type="hidden" name="nomineeId" value={nomineeId} />
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="grid items-end gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="Award" htmlFor="awardId" help={picked?.description || "Awards given automatically aren't listed."}>
              <Select id="awardId" name="awardId" value={awardId} onChange={(e) => setAwardId(e.target.value)} required autoComplete="off">
                <option value="">Choose an award…</option>
                {awards.map((a) => (
                  <option key={a.id} value={a.id} disabled={!!a.blocked}>
                    {a.name}
                    {a.blocked ? ` (${a.blocked})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="hidden pb-1 sm:block" aria-hidden={!picked}>
              {picked ? <Ribbon stripes={picked.stripes} device={picked.device} label={`${picked.name} ribbon`} /> : <div className="aspect-[36/10] rounded-[1px] border border-dashed" />}
            </div>
          </div>
          {picked && (
            <div className="sm:hidden">
              <Ribbon stripes={picked.stripes} device={picked.device} label={`${picked.name} ribbon`} className="max-w-40" />
            </div>
          )}
          <Field label="Citation" htmlFor="citation" help="Required. Read out in the announcement and kept on the service record.">
            <Textarea id="citation" name="citation" required minLength={10} maxLength={1000} className="min-h-28" placeholder="What did they do?" />
          </Field>
          <Field label="Operation (optional)" htmlFor="eventId" help="Link the award to the op it was earned on.">
            <Select id="eventId" name="eventId" defaultValue="" autoComplete="off">
              <option value="">No particular operation</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </Select>
          </Field>
          <SubmitButton pendingText="Submitting…" className="self-start">
            Submit nomination
          </SubmitButton>
        </CardContent>
      </Card>
    </ActionForm>
  );
}
