import type { MemberStatus, Prisma } from "@prisma/client";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { MemberStatusBadge } from "@/components/status-badge";
import { RankInsignia } from "@/components/insignia";
import { RosterFilterForm } from "@/components/roster-filter-form";
import { SquadEmblem } from "@/components/squad-emblem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RANKS, rankIndex, roleDef, SQUADS, UNIT_ROLES } from "@/config/unit";
import { onLeave } from "@/lib/personnel";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";

const STATUSES: MemberStatus[] = ["ACTIVE", "INACTIVE", "CANDIDATE", "DISCHARGED"];

export type ListQuery = { q?: string; rank?: string; squad?: string; role?: string; status?: string };

// The roster as a searchable, filterable table.
export async function ListView({ sp }: { sp: ListQuery }) {
  const status = sp.status === "ALL" ? undefined : STATUSES.includes(sp.status as MemberStatus) ? (sp.status as MemberStatus) : "ACTIVE";

  const where: Prisma.UserWhereInput = {
    status,
    rank: sp.rank || undefined,
    squad: sp.squad || undefined,
    unitRole: sp.role || undefined,
    ...(sp.q
      ? {
          OR: [
            { callsign: { contains: sp.q, mode: "insensitive" } },
            { discordUsername: { contains: sp.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const members = await prisma.user.findMany({
    where,
    include: { _count: { select: { qualifications: true, attendances: { where: { status: "ATTENDING", event: { startTime: { lt: new Date() } } } } } } },
    take: 500,
  });
  const away = await onLeave(members.map((m) => m.id));
  // Highest rank first, then callsign.
  members.sort(
    (a, b) => rankIndex(b.rank) - rankIndex(a.rank) || (a.callsign ?? a.discordUsername).localeCompare(b.callsign ?? b.discordUsername),
  );

  const name = (m: (typeof members)[number]) => m.callsign ?? m.discordUsername;
  // Chips for every filter that narrows the list; each one links to the list without it.
  const params = { q: sp.q, rank: sp.rank, squad: sp.squad, role: sp.role, status: sp.status };
  const href = (omit?: keyof typeof params) => {
    const u = new URLSearchParams({ view: "list" });
    for (const [k, v] of Object.entries(params)) if (v && k !== omit) u.set(k, v);
    return `/roster?${u}`;
  };
  const statusLabel = sp.status === "ALL" ? "Any status" : sp.status && STATUSES.includes(sp.status as MemberStatus) && sp.status !== "ACTIVE" ? sp.status[0] + sp.status.slice(1).toLowerCase() : null;
  const chips = [
    sp.q && { key: "q" as const, text: `Search: ${sp.q}` },
    sp.rank && { key: "rank" as const, text: `Rank: ${sp.rank}` },
    sp.squad && { key: "squad" as const, text: `Squad: ${sp.squad}` },
    sp.role && { key: "role" as const, text: `Role: ${sp.role}` },
    statusLabel && { key: "status" as const, text: `Status: ${statusLabel}` },
  ].filter((c): c is { key: "q" | "rank" | "squad" | "role" | "status"; text: string } => !!c);

  return (
    <>
      <RosterFilterForm className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_repeat(4,auto)_auto]">
        <input type="hidden" name="view" value="list" />
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input name="q" type="search" aria-label="Search callsign or username" placeholder="Search callsign or username" defaultValue={sp.q} className="pl-8" />
        </div>
        <Select name="rank" aria-label="Filter by rank" defaultValue={sp.rank ?? ""}>
          <option value="">All ranks</option>
          {RANKS.map((r) => (
            <option key={r.abbr} value={r.abbr}>
              {r.abbr} — {r.name}
            </option>
          ))}
        </Select>
        <Select name="squad" aria-label="Filter by squad" defaultValue={sp.squad ?? ""}>
          <option value="">All squads</option>
          {SQUADS.map((s) => (
            <option key={s.name}>{s.name}</option>
          ))}
        </Select>
        <Select name="role" aria-label="Filter by role" defaultValue={sp.role ?? ""}>
          <option value="">All roles</option>
          {UNIT_ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
        <Select name="status" aria-label="Filter by status" defaultValue={sp.status ?? "ACTIVE"}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0] + s.slice(1).toLowerCase()}
            </option>
          ))}
          <option value="ALL">Any status</option>
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </RosterFilterForm>

      {chips.length > 0 && (
        <ul className="mb-4 flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <li key={c.key}>
              <Link
                href={href(c.key)}
                aria-label={`Remove filter ${c.text}`}
                className="inline-flex items-center gap-1 rounded-sm border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-accent hover:bg-accent/20"
              >
                {c.text} <X className="size-3" aria-hidden />
              </Link>
            </li>
          ))}
          <li>
            <Link href="/roster?view=list" className="px-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Clear all
            </Link>
          </li>
        </ul>
      )}

      {/* Below md: one stacked card per member. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {members.map((m) => (
          <li key={m.id}>
            <Link href={`/roster/${m.id}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:border-accent">
              <RankInsignia rank={m.rank} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Avatar discordId={m.discordId} avatar={m.avatar} name={name(m)} size={20} />
                  <span className="truncate font-semibold">{name(m)}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {m.squad && <SquadEmblem name={m.squad} size={16} />}
                  <span className="truncate">{[m.squad, m.unitRole].filter(Boolean).join(" · ") || "Unassigned"}</span>
                </div>
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <MemberStatusBadge status={m.status} />
                {away.has(m.id) && <Badge variant="accent">LOA</Badge>}
              </span>
            </Link>
          </li>
        ))}
        {!members.length && <li className="rounded-lg border py-10 text-center text-sm text-muted-foreground">No members match those filters.</li>}
      </ul>

      <Card className="hidden md:block">
        <Table>
          <THead>
            <TR>
              <TH>Rank</TH>
              <TH>Callsign</TH>
              <TH>Squad</TH>
              <TH>Role</TH>
              <TH>Ops</TH>
              <TH>Quals</TH>
              <TH className="hidden lg:table-cell">Enlisted</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD>
                  {m.rank ? (
                    <span className="flex items-center gap-2">
                      <RankInsignia rank={m.rank} size={24} />
                      <Badge variant="accent">{m.rank}</Badge>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TD>
                <TD>
                  <Link href={`/roster/${m.id}`} className="flex items-center gap-2 font-semibold hover:text-accent">
                    <Avatar discordId={m.discordId} avatar={m.avatar} name={name(m)} size={24} />
                    <span>
                      {name(m)}
                      {m.callsign && <span className="ml-2 text-xs font-normal text-muted-foreground">@{m.discordUsername}</span>}
                    </span>
                  </Link>
                </TD>
                <TD>
                  {m.squad ? (
                    <span className="flex items-center gap-1.5">
                      <SquadEmblem name={m.squad} size={20} /> {m.squad}
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>
                  {m.unitRole ?? "—"}
                  {m.unitRole && <span className="ml-1.5 font-mono text-micro text-muted-foreground">{roleDef(m.unitRole)?.code}</span>}
                </TD>
                <TD>{m._count.attendances}</TD>
                <TD>{m._count.qualifications}</TD>
                <TD className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">{m.enlistedAt ? fmtDate(m.enlistedAt) : "—"}</TD>
                <TD>
                  <span className="flex flex-wrap gap-1">
                    <MemberStatusBadge status={m.status} />
                    {away.has(m.id) && <Badge variant="accent">LOA</Badge>}
                  </span>
                </TD>
              </TR>
            ))}
            {!members.length && (
              <TR>
                <TD colSpan={8} className="py-10 text-center text-muted-foreground">
                  No members match those filters.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground" role="status">
        {members.length} member{members.length === 1 ? "" : "s"} shown.
      </p>
    </>
  );
}
