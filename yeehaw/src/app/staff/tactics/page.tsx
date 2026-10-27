import Link from "next/link";
import { BoardEditor } from "@/components/board-editor";
import { Bench, Pitch } from "@/components/pitch";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Select } from "@/components/ui/input";
import { FORMATION_NAMES } from "@/config/formations";
import type { BoardSlots } from "@/lib/board";
import { getSessionUser, requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { liveSquad, toBoardPlayer } from "@/lib/squad";
import { loadTactics, unlinkedEaNames } from "@/lib/tactics";
import { fmt } from "@/lib/time";
import { saveTacticsAction } from "./actions";

export const metadata = { title: "Tactics" };
export const dynamic = "force-dynamic";

// Every member reads the board; staff edit it (as the old site did).
export default async function Page({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requireUser("MEMBER", "/staff/tactics");
  const user = await getSessionUser();
  const isStaff = hasPerm(user?.perms, "STAFF");
  const [tactics, squad, eaNames] = await Promise.all([loadTactics(), liveSquad(), isStaff ? unlinkedEaNames() : []]);
  const stamp = tactics.updatedAt ? `Last saved ${fmt(tactics.updatedAt)}${tactics.updatedByName ? ` by ${tactics.updatedByName}` : ""}.` : "";

  if (isStaff) {
    return (
      <Container>
        <PageHeader
          eyebrow="Staff"
          title="Tactics"
          description="Who plays where in each formation. Each formation remembers its own board; Save replaces the one you're on and makes it the active shape."
        />
        {stamp && <p className="mb-4 text-xs text-muted-foreground">{stamp}</p>}
        <BoardEditor
          formations={FORMATION_NAMES}
          initialFormation={tactics.active}
          initialSlots={tactics.byFormation}
          remember
          roster={squad.map((e) => toBoardPlayer(e, `p:${e.playerId}`))}
          allowNames
          nameSuggestions={eaNames}
          rosterTitle="Roster"
          actions={[{ intent: "save", label: "Save lineup" }]}
          onSave={saveTacticsAction}
        />
      </Container>
    );
  }

  // Read-only view: pick a formation with a plain link, no script needed.
  const sp = await searchParams;
  const formation = FORMATION_NAMES.includes(sp.f ?? "") ? sp.f! : tactics.active;
  const ids = Object.values(tactics.byFormation[formation] ?? {}).flatMap((v) => (v.startsWith("p:") ? [v.slice(2)] : []));
  const people = await prisma.player.findMany({ where: { id: { in: ids } } });
  const byId = new Map(people.map((p) => [p.id, p]));
  const live = new Map(squad.map((e) => [e.playerId, e]));
  const slots: BoardSlots = {};
  for (const [k, v] of Object.entries(tactics.byFormation[formation] ?? {})) {
    if (v.startsWith("n:")) slots[k] = { key: v, name: v.slice(2), discordId: "0", avatar: null };
    else {
      const e = live.get(v.slice(2));
      const p = byId.get(v.slice(2));
      if (e) slots[k] = toBoardPlayer(e, v);
      else if (p) slots[k] = { key: v, name: p.displayName, discordId: p.discordId, avatar: p.avatar, slug: p.slug };
    }
  }
  return (
    <Container>
      <PageHeader eyebrow="Matchday" title="Tactics" description="The squad's current lineup." />
      <form className="mb-4 flex items-end gap-2" method="get">
        <label className="flex flex-col gap-1">
          <span className="field-label">Formation</span>
          <Select name="f" defaultValue={formation} className="w-36">
            {FORMATION_NAMES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </label>
        <button className="h-9 min-h-10 rounded-md border border-input px-3 text-xs font-semibold uppercase tracking-wider hover:bg-secondary sm:min-h-0">Show</button>
        {formation !== tactics.active && (
          <Link href="/staff/tactics" className="pb-2 text-xs text-accent underline">
            Back to the active shape ({tactics.active})
          </Link>
        )}
      </form>
      {stamp && <p className="mb-4 text-xs text-muted-foreground">{stamp}</p>}
      <Pitch formation={formation} slots={slots} />
      <h3 className="field-label mb-2 mt-6">Substitutes bench</h3>
      <div className="rounded-lg border bg-card p-3">
        <Bench formation={formation} slots={slots} hideEmpty />
      </div>
    </Container>
  );
}
