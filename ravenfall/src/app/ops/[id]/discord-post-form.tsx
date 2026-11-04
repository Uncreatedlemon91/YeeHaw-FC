"use client";

import { RefreshCw, Send } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { discordPost } from "../actions";

/** Update the event's Discord notice in place, or send it again (pinging the invited squads). */
export function DiscordPostForm({ eventId, posted }: { eventId: string; posted: boolean }) {
  return (
    <ActionForm action={discordPost} className="gap-2">
      <input type="hidden" name="id" value={eventId} />
      <div className="flex flex-wrap gap-2">
        {posted && (
          <SubmitButton name="mode" value="update" variant="outline" size="sm" pendingText="Updating…">
            <RefreshCw /> Update post
          </SubmitButton>
        )}
        <SubmitButton name="mode" value="repost" variant="outline" size="sm" pendingText="Posting…">
          <Send /> {posted ? "Repost" : "Post to Discord"}
        </SubmitButton>
      </div>
      <p className="text-micro text-muted-foreground">
        {posted
          ? "Update edits the notice in place. Repost sends a fresh one, pings the invited squads again and removes the old one."
          : "Not on Discord yet. Posting pings the invited squads."}
      </p>
    </ActionForm>
  );
}
