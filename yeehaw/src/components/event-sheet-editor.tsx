"use client";

import { BoardEditor, type SaveOutcome } from "@/components/board-editor";
import type { BoardPlayer } from "@/lib/board";
import type { SlotMap } from "@/lib/lineup-rules";

/**
 * Staff pick the event's team sheet on the shared board. The formation is the
 * event's own (change it by editing the event), so the picker has one choice.
 * The server re-checks everything on save.
 */
export function EventSheetEditor({
  eventId,
  formation,
  initialSlots,
  roster,
  save,
}: {
  eventId: string;
  formation: string;
  initialSlots: SlotMap;
  roster: BoardPlayer[];
  save: (eventId: string, input: { formation: string; slots: unknown; intent: string }) => Promise<SaveOutcome>;
}) {
  return (
    <BoardEditor
      formations={[formation]}
      initialFormation={formation}
      initialSlots={{ [formation]: initialSlots }}
      remember={false}
      roster={roster}
      rosterTitle="Squad and sign-ups"
      emptyRosterText="Everyone is on the sheet."
      actions={[
        { intent: "draft", label: "Save draft", variant: "secondary" },
        { intent: "publish", label: "Publish team sheet", confirm: "Publish this team sheet? It is posted in Discord and each player is DMed their position." },
      ]}
      onSave={(input) => save(eventId, input)}
    />
  );
}
