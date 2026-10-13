import type { MemberStatus, Prisma } from "@prisma/client";
import { Search } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { MemberStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RANKS, rankIndex, roleDef, SQUADS, UNIT_ROLES } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { onLeave } from "@/lib/personnel";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";

export const metadata = { title: "Roster" };

const STATUSES: MemberStatus[] = ["ACTIVE", "INACTIVE", "CANDIDATE", "DISCHARGED"];

type Q = { q?: string; rank?: string; squad?: string; role?: string; status?: string };

export default async function Roster({ searchParams }: { searchParams: Promise<Q> }) {
  await requireUser("OPERATOR", "/roster");
  const sp = await searchParams;
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

  return (
    <Container>
      <PageHeader eyebrow="Personnel" title="Roster" description={`${members.length} member${members.length === 1 ? "" : "s"} shown.`} />
      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_repeat(4,auto)_auto]">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input name="q" placeholder="Search callsign or username" defaultValue={sp.q} className="pl-8" />
        </div>
        <Select name="rank" defaultValue={sp.rank ?? ""}>
          <option value="">All ranks</option>
          {RANKS.map((r) => (
            <option key={r.abbr} value={r.abbr}>
              {r.abbr} — {r.name}
            </option>
          ))}
        </Select>
        <Select name="squad" defaultValue={sp.squad ?? ""}>
          <option value="">All squads</option>
          {SQUADS.map((s) => (
            <option key={s.name}>{s.name}</option>
          ))}
        </Select>
        <Select name="role" defaultValue={sp.role ?? ""}>
          <option value="">All roles</option>
          {UNIT_ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={sp.status ?? "ACTIVE"}>
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
      </form>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Rank</TH>
              <TH>Callsign</TH>
              <TH className="hidden sm:table-cell">Squad</TH>
              <TH className="hidden md:table-cell">Role</TH>
              <TH className="hidden md:table-cell">Ops</TH>
              <TH className="hidden md:table-cell">Quals</TH>
              <TH className="hidden lg:table-cell">Enlisted</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD>{m.rank ? <Badge variant="accent">{m.rank}</Badge> : <span className="text-muted-foreground">—</span>}</TD>
                <TD>
                  <Link href={`/roster/${m.id}`} className="flex items-center gap-2 font-semibold hover:text-accent">
                    <Avatar discordId={m.discordId} avatar={m.avatar} size={24} />
                    <span>
                      {m.callsign ?? m.discordUsername}
                      {m.callsign && <span className="ml-2 text-xs font-normal text-muted-foreground">@{m.discordUsername}</span>}
                    </span>
                  </Link>
                </TD>
                <TD className="hidden sm:table-cell">{m.squad ?? "—"}</TD>
                <TD className="hidden md:table-cell">
                  {m.unitRole ?? "—"}
                  {m.unitRole && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{roleDef(m.unitRole)?.code}</span>}
                </TD>
                <TD className="hidden md:table-cell">{m._count.attendances}</TD>
                <TD className="hidden md:table-cell">{m._count.qualifications}</TD>
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
    </Container>
  );
}
