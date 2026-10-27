import { BoardEditor } from "@/components/board-editor";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { FORMATION_NAMES } from "@/config/formations";
import { requireUser } from "@/lib/auth";
import { loadEditorState } from "@/lib/lineups";
import { liveSquad, toBoardPlayer } from "@/lib/squad";
import { fmt } from "@/lib/time";
import { saveLineupAction } from "./actions";

export const metadata = { title: "Lineup" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireUser("STAFF", "/staff/lineup");
  const [squad, state] = await Promise.all([liveSquad(), loadEditorState()]);
  return (
    <Container>
      <PageHeader
        eyebrow="Staff"
        title="Lineup"
        description="Build the first-choice XI and the bench from players under contract. Save keeps a draft; Publish puts it on the Squad page and the home page."
      />
      <p className="mb-4 text-xs text-muted-foreground">
        {state.publishedAt ? `Published ${fmt(state.publishedAt)}.` : "Nothing published yet."} {state.draftSavedAt ? `Draft saved ${fmt(state.draftSavedAt)}.` : ""}
      </p>
      <BoardEditor
        formations={FORMATION_NAMES}
        initialFormation={state.formation}
        initialSlots={{ [state.formation]: state.slots }}
        remember={false}
        roster={squad.map((e) => toBoardPlayer(e))}
        rosterTitle="Under contract"
        emptyRosterText="Everyone under contract is on the board."
        actions={[
          { intent: "draft", label: "Save draft", variant: "secondary" },
          { intent: "publish", label: "Publish lineup", confirm: "Publish this lineup to the Squad page and the home page?" },
        ]}
        onSave={saveLineupAction}
      />
    </Container>
  );
}
