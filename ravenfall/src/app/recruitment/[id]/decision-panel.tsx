"use client";

import { useActionState, useState } from "react";
import { type ActionState, FormMessage, SubmitButton } from "@/components/action-form";
import { RankInsignia } from "@/components/insignia";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { RANKS, RECRUIT_RANK } from "@/config/unit";
import { approve, deny } from "../actions";

// Client-side so the outcome survives the re-render: once a decision lands
// the page stops being PENDING, and a plain server-rendered form would
// unmount before its result (and any Discord warnings) could be shown.
export function DecisionPanel({ appId, pending, callsign }: { appId: string; pending: boolean; callsign: string }) {
  // Either decision locks the other form while it is in flight.
  const [approving, setApproving] = useState(false);
  const [denying, setDenying] = useState(false);
  const [approved, approveAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    setApproving(true);
    try {
      return await approve(prev, fd);
    } finally {
      setApproving(false);
    }
  }, undefined);
  const [denied, denyAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    setDenying(true);
    try {
      return await deny(prev, fd);
    } finally {
      setDenying(false);
    }
  }, undefined);
  const [rank, setRank] = useState<string>(RECRUIT_RANK);
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
              <div className="flex items-center gap-3">
                <Select id="rank" name="rank" value={rank} onChange={(e) => setRank(e.target.value)} className="flex-1">
                  {RANKS.map((r) => (
                    <option key={r.abbr} value={r.abbr}>
                      {r.abbr} — {r.name}
                    </option>
                  ))}
                </Select>
                <RankInsignia rank={rank} size={36} />
              </div>
            </Field>
            <Field label="Note (optional)" htmlFor="approve-note">
              <Textarea id="approve-note" name="note" className="min-h-16" maxLength={500} />
            </Field>
            <SubmitButton pendingText="Approving…" disabled={denying}>Approve & enlist</SubmitButton>
            <FormMessage state={approved} />
          </form>
        </CardContent>
      </Card>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive-fg">Deny</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={denyAction} className="flex flex-col gap-4">
            <input type="hidden" name="appId" value={appId} />
            <Field label="Reason (recruiters only)" htmlFor="deny-note">
              <Textarea id="deny-note" name="note" className="min-h-16" maxLength={500} />
            </Field>
            <SubmitButton variant="destructive" pendingText="Denying…" disabled={approving}>
              Deny
            </SubmitButton>
            <FormMessage state={denied} />
          </form>
        </CardContent>
      </Card>
    </>
  );
}
