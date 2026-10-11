import type { ServiceRecordType } from "@prisma/client";
import { Award, BadgeCheck, Flag, Medal, ScrollText, ShieldAlert, Shuffle, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { ConfirmButton } from "@/components/confirm-button";
import { Container } from "@/components/container";
import { AttendanceBadge, MemberStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { RANKS, rankName, SQUADS, UNIT_ROLES } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmt, fmtDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { addRecord, awardQualification, deleteRecord, revokeQualification, updateProfile } from "../actions";

export const metadata = { title: "Dossier" };

const RECORD_STYLE: Record<ServiceRecordType, { icon: typeof Award; color: string; label: string }> = {
  ENLISTMENT: { icon: UserPlus, color: "text-green-400", label: "Enlistment" },
  PROMOTION: { icon: Medal, color: "text-accent", label: "Promotion" },
  AWARD: { icon: Award, color: "text-accent", label: "Award" },
  QUALIFICATION: { icon: BadgeCheck, color: "text-sky-400", label: "Qualification" },
  DISCIPLINARY: { icon: ShieldAlert, color: "text-red-400", label: "Disciplinary" },
  TRANSFER: { icon: Shuffle, color: "text-violet-400", label: "Transfer" },
  DISCHARGE: { icon: Flag, color: "text-muted-foreground", label: "Discharge" },
  NOTE: { icon: ScrollText, color: "text-muted-foreground", label: "Note" },
};

export default async function Dossier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser("OPERATOR", `/roster/${id}`);
  const member = await prisma.user.findUnique({
    where: { id },
    include: {
      serviceRecords: { orderBy: { createdAt: "desc" }, include: { issuedBy: true } },
      qualifications: { include: { qualification: true, awardedBy: true }, orderBy: { awardedAt: "desc" } },
      attendances: { include: { event: true }, orderBy: { event: { startTime: "desc" } }, take: 15 },
    },
  });
  if (!member) notFound();

  const isAdmin = hasPerm(me.perms, "ADMIN");
  const isInstructor = hasPerm(me.perms, "INSTRUCTOR");
  const isRecruiter = hasPerm(me.perms, "RECRUITER");
  const isSelf = me.id === member.id;
  // Disciplinary entries are between the member and Command.
  const records = member.serviceRecords.filter((r) => r.type !== "DISCIPLINARY" || isAdmin || isSelf);

  const past = member.attendances.filter((a) => a.event.startTime < new Date());
  const counted = await prisma.attendance.groupBy({
    by: ["status"],
    where: { userId: id, event: { startTime: { lt: new Date() } } },
    _count: true,
  });
  const n = (s: string) => counted.find((c) => c.status === s)?._count ?? 0;
  const attended = n("ATTENDING");
  const total = attended + n("ABSENT") + n("NOSHOW") + n("EXCUSED");
  const rate = total ? Math.round((attended / total) * 100) : null;

  const allQuals = isInstructor
    ? await prisma.qualification.findMany({
        where: { id: { notIn: member.qualifications.map((q) => q.qualificationId) } },
        orderBy: [{ category: "asc" }, { title: "asc" }],
      })
    : [];

  return (
    <Container className="max-w-5xl">
      {/* Header: the dossier card. */}
      <div className="tac-grid mb-6 overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <Avatar discordId={member.discordId} avatar={member.avatar} size={88} className="rounded-md" />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
              {member.rank ? rankName(member.rank) : "Personnel file"}
            </p>
            <h1 className="mt-1 text-3xl font-bold uppercase sm:text-4xl">
              {member.rank && <span className="mr-2 text-muted-foreground">{member.rank}</span>}
              {member.callsign ?? member.discordUsername}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <MemberStatusBadge status={member.status} />
              <span>@{member.discordUsername}</span>
              {member.squad && <span>· {member.squad}</span>}
              {member.unitRole && <span>· {member.unitRole}</span>}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-center sm:gap-6">
            <Stat label="Enlisted" value={member.enlistedAt ? fmt(member.enlistedAt, "MMM yyyy") : "—"} />
            <Stat label="Ops attended" value={String(attended)} />
            <Stat label="Attendance" value={rate === null ? "—" : `${rate}%`} />
          </dl>
        </div>
        {/* Ribbon rack: one bar per qualification. */}
        {member.qualifications.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t bg-background/40 px-6 py-3">
            {member.qualifications.map((q) => (
              <Link
                key={q.id}
                href={`/vault/${q.qualification.slug}`}
                title={`${q.qualification.title} — ${fmtDate(q.awardedAt)}`}
                className={cn("h-3 w-10 rounded-[2px] border border-black/40", RIBBON[q.qualification.category])}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Service record</CardTitle>
            </CardHeader>
            <CardContent>
              {records.length ? (
                <ol className="relative flex flex-col gap-5 border-l pl-6">
                  {records.map((r) => {
                    const s = RECORD_STYLE[r.type];
                    const Icon = s.icon;
                    return (
                      <li key={r.id} className="relative">
                        <span className="absolute -left-[35px] flex size-6 items-center justify-center rounded-full border bg-card">
                          <Icon className={cn("size-3.5", s.color)} />
                        </span>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {s.label} · {fmtDate(r.createdAt)}
                            </div>
                            <div className="font-semibold">{r.title}</div>
                            {r.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{r.description}</p>}
                            {r.issuedBy && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Issued by {r.issuedBy.callsign ?? r.issuedBy.discordUsername}
                              </p>
                            )}
                          </div>
                          {isAdmin && (
                            <form action={deleteRecord}>
                              <input type="hidden" name="recordId" value={r.id} />
                              <ConfirmButton message="Delete this service record entry?" variant="ghost" size="icon" title="Delete entry" className="text-muted-foreground">
                                <Trash2 />
                              </ConfirmButton>
                            </form>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No entries yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent operations</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {past.length ? (
                past.map((a) => (
                  <Link key={a.id} href={`/ops/${a.eventId}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-accent">
                    <span>
                      <span className="font-semibold">{a.event.title}</span>
                      <span className="ml-2 text-muted-foreground">{fmtDate(a.event.startTime)}</span>
                    </span>
                    <AttendanceBadge status={a.status} />
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No operations on record.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Qualifications</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {member.qualifications.map((q) => (
                <div key={q.id} className="flex items-center justify-between gap-2">
                  <Link href={`/vault/${q.qualification.slug}`} className="flex items-center gap-2 hover:text-accent">
                    <span className={cn("h-3 w-6 rounded-[2px]", RIBBON[q.qualification.category])} />
                    <span className="text-sm font-semibold">{q.qualification.title}</span>
                  </Link>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{fmtDate(q.awardedAt)}</span>
                    {isInstructor && (
                      <form action={revokeQualification}>
                        <input type="hidden" name="userQualId" value={q.id} />
                        <ConfirmButton message={`Revoke ${q.qualification.title}?`} variant="ghost" size="icon" title="Revoke" className="size-7 text-muted-foreground">
                          <X />
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                </div>
              ))}
              {!member.qualifications.length && <p className="text-sm text-muted-foreground">None yet.</p>}
              {isInstructor && allQuals.length > 0 && (
                <ActionForm action={awardQualification} className="mt-2 border-t pt-4">
                  <input type="hidden" name="userId" value={member.id} />
                  <Field label="Award qualification" htmlFor="qualificationId">
                    <Select id="qualificationId" name="qualificationId" required>
                      {allQuals.map((q) => (
                        <option key={q.id} value={q.id}>
                          [{q.category}] {q.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton size="sm">Award</SubmitButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Edit profile</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={updateProfile}>
                  <input type="hidden" name="userId" value={member.id} />
                  <Field label="Callsign" htmlFor="callsign">
                    <Input id="callsign" name="callsign" defaultValue={member.callsign ?? ""} maxLength={24} />
                  </Field>
                  <Field label="Rank" htmlFor="rank">
                    <Select id="rank" name="rank" defaultValue={member.rank ?? ""}>
                      <option value="">Unranked</option>
                      {RANKS.map((r) => (
                        <option key={r.abbr} value={r.abbr}>
                          {r.abbr} — {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Squad" htmlFor="squad">
                    <Select id="squad" name="squad" defaultValue={member.squad ?? ""}>
                      <option value="">Unassigned</option>
                      {SQUADS.map((s) => (
                        <option key={s.name}>{s.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Role" htmlFor="unitRole">
                    <Select id="unitRole" name="unitRole" defaultValue={member.unitRole ?? ""}>
                      <option value="">Unassigned</option>
                      {UNIT_ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Status" htmlFor="status">
                    <Select id="status" name="status" defaultValue={member.status}>
                      {["CANDIDATE", "ACTIVE", "INACTIVE", "DISCHARGED"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    Rank, squad and status changes are written to the service record automatically, and the Discord
                    nickname follows the rank and callsign.
                  </p>
                  <SubmitButton size="sm">Save</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}

          {isRecruiter && (
            <Card>
              <CardHeader>
                <CardTitle>Add record entry</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={addRecord}>
                  <input type="hidden" name="userId" value={member.id} />
                  <Field label="Type" htmlFor="type">
                    <Select id="type" name="type">
                      {(isAdmin
                        ? (["AWARD", "NOTE", "DISCIPLINARY", "ENLISTMENT", "PROMOTION", "TRANSFER", "DISCHARGE"] as const)
                        : (["ENLISTMENT", "NOTE"] as const)
                      ).map((t) => (
                        <option key={t} value={t}>
                          {RECORD_STYLE[t].label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Title" htmlFor="title">
                    <Input id="title" name="title" required maxLength={120} placeholder="e.g. Combat Action Ribbon" />
                  </Field>
                  <Field label="Details (optional)" htmlFor="description">
                    <Textarea id="description" name="description" className="min-h-16" />
                  </Field>
                  <SubmitButton size="sm">Add entry</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Container>
  );
}

// Ribbon colours per qualification category.
const RIBBON: Record<string, string> = {
  WEAPONS: "bg-[linear-gradient(90deg,#7a1f1f_0_30%,#c9a227_30%_40%,#7a1f1f_40%_60%,#c9a227_60%_70%,#7a1f1f_70%)]",
  LEADERSHIP: "bg-[linear-gradient(90deg,#1f3a7a_0_35%,#e5e5e5_35%_45%,#1f3a7a_45%_55%,#e5e5e5_55%_65%,#1f3a7a_65%)]",
  MEDICAL: "bg-[linear-gradient(90deg,#e5e5e5_0_40%,#a32020_40%_60%,#e5e5e5_60%)]",
  PILOT: "bg-[linear-gradient(90deg,#3b6fb5_0_25%,#c9a227_25%_35%,#3b6fb5_35%_65%,#c9a227_65%_75%,#3b6fb5_75%)]",
  GENERAL: "bg-[linear-gradient(90deg,#4f6b2f_0_40%,#d4b483_40%_60%,#4f6b2f_60%)]",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="font-display text-2xl font-bold">{value}</dd>
      <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
    </div>
  );
}
