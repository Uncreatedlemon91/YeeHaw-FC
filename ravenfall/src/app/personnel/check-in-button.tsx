"use client";

import { MessageCircle } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { checkIn } from "./actions";

export function CheckInButton({ userId, sentLabel }: { userId: string; sentLabel: string | null }) {
  return (
    <ActionForm action={checkIn} className="items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      {sentLabel ? (
        <span className="text-micro text-muted-foreground">{sentLabel}</span>
      ) : (
        <SubmitButton size="sm" variant="outline" pendingText="Sending…">
          <MessageCircle /> Check in
        </SubmitButton>
      )}
    </ActionForm>
  );
}
