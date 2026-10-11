"use client";

import { useActionState } from "react";
import { type ActionState, FormMessage, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { RANKS, RECRUIT_RANK } from "@/config/unit";
import { approve, deny } from "../actions";

// Client-side so the outcome survives the re-render: once a decision lands
// the page stops being PENDING, and a plain server-rendered form would
// unmount before its result (and any Discord warnings) could be shown.
export function DecisionPanel({ appId, pending, callsign }: { appId: string; pending: boolean; callsign: string }) {
  const [approved, approveAction] = useActionState(approve, undefined);
  const [denied, denyAction] = useActionState(deny, undefined);
  const result: ActionState = approved?.ok ? approved : denied?.ok ? denied : undefined;

  if (result) {
    return (
      <Card>
        <CardContent className="py-4">
          <FormMessage state={result} />
        </CardContent>
      </Card>
    );
  }
  if (!pending) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Approve</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={approveAction} className="flex flex-col gap-4">
            <input type="hidden" name="appId" value={appId} />
            <Field label="Callsign" htmlFor="callsign">
              <Input id="callsign" name="callsign" defaultValue={callsign} required maxLength={24} />
            </Field>
            <Field label="Starting rank" htmlFor="rank">
              <Select id="rank" name="rank" defaultValue={RECRUIT_RANK}>
                {RANKS.map((r) => (
                  <option key={r.abbr} value={r.abbr}>
                    {r.abbr} — {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note (optional)" htmlFor="approve-note">
              <Textarea id="approve-note" name="note" className="min-h-16" maxLength={500} />
            </Field>
            <SubmitButton pendingText="Approving…">Approve & enlist</SubmitButton>
            <FormMessage state={approved} />
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deny</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={denyAction} className="flex flex-col gap-4">
            <input type="hidden" name="appId" value={appId} />
            <Field label="Reason (recruiters only)" htmlFor="deny-note">
              <Textarea id="deny-note" name="note" className="min-h-16" maxLength={500} />
            </Field>
            <SubmitButton variant="destructive" pendingText="Denying…">
              Deny
            </SubmitButton>
            <FormMessage state={denied} />
          </form>
        </CardContent>
      </Card>
    </>
  );
}
