import { CalendarOff, CheckCircle2, Circle, Crosshair, Lock, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { ChipCheckbox } from "@/components/chip";
import { ConfirmButton } from "@/components/confirm-button";
import { RankInsignia } from "@/components/insignia";
import { Redacted, RedactedBar } from "@/components/redacted";
import { AttendanceBadge, ATTENDANCE_LABEL, MemberStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { MAX_SECONDARY_ROLES, RANKS, rankIndex, rankName, roleDef, ROLES, squadDef, SQUADS, UNIT, UNIT_ROLES, WEEKDAYS } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { career } from "@/lib/career";
import { hasPerm } from "@/lib/permissions";
import { billetFill, billetKey, canDecide, clearanceFor, missingQuals, onLeave, recordTypesFor, serviceNumber } from "@/lib/personnel";
import { prisma } from "@/lib/prisma";
import { fmt, fmtDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requestCallsign, requestLeave, updateOwnProfile } from "../../personnel/actions";
import { RequestCard } from "../../personnel/request-card";
import { addRecord, awardQualification, revokeQualification, updateProfile } from "../actions";
import { BilletPicker } from "./billet-picker";
import { FileTabs } from "./file-tabs";
import { RECORD_STYLE } from "./record-style";
import { RecordTimeline } from "./record-timeline";
import { RequestForm } from "./request-form";

export const metadata = { title: "Personnel file" };

type SP = { tab?: string; squad?: string; role?: string };

export default async function Dossier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireUser("OPERATOR", `/roster/${id}`);
  const [member, viewer] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        serviceRecords: { orderBy: { createdAt: "desc" }, include: { issuedBy: true } },
        qualifications: { include: { qualification: true, awardedBy: true }, orderBy: { awardedAt: "desc" } },
        attendances: { where: { event: { startTime: { lt: new Date() } } }, include: { event: true }, orderBy: { event: { startTime: "desc" } }, take: 24 },
        requests: { orderBy: { createdAt: "desc" }, include: { reviewedBy: true }, take: 25 },
      },
    }),
    prisma.user.findUnique({ where: { id: me.id } }),
  ]);
  if (!member) notFound();

  const clr = clearanceFor(me, viewer, member);
  const isAdmin = hasPerm(me.perms, "ADMIN");
  const isInstructor = hasPerm(me.perms, "INSTRUCTOR");
  const records = member.serviceRecords.filter(
    (r) => (r.type !== "DISCIPLINARY" || clr.command || clr.self) && (r.type !== "COUNSELING" || clr.squad),
  );

  const [counted, fill, allQuals, leave] = await Promise.all([
    prisma.attendance.groupBy({ by: ["status"], where: { userId: id, event: { startTime: { lt: new Date() } } }, _count: true }),
    billetFill(),
    prisma.qualification.findMany({ orderBy: [{ category: "asc" }, { title: "asc" }] }),
    onLeave([id]),
  ]);
  const n = (s: string) => counted.find((c) => c.status === s)?._count ?? 0;
  const attended = n("ATTENDING");
  const total = attended + n("ABSENT") + n("NOSHOW") + n("EXCUSED");
  const rate = total ? Math.round((attended / total) * 100) : null;

  const held = member.qualifications.map((q) => q.qualification.slug);
  const qualTitle = Object.fromEntries(allQuals.map((q) => [q.slug, q.title]));
  const titles = (slugs: string[]) => slugs.map((s) => qualTitle[s] ?? s);
  const since =
    member.rankSince ?? member.serviceRecords.find((r) => r.type === "PROMOTION")?.createdAt ?? member.enlistedAt ?? null;
  const path = career({ rank: member.rank, since, enlistedAt: member.enlistedAt, opsAttended: attended, quals: held, qualTitles: qualTitle });
  const currentLeave = leave.get(id);
  const pendingTypes = new Set(member.requests.filter((r) => r.status === "PENDING").map((r) => r.type));
  const recordTypes = recordTypesFor(me.perms, viewer, member.squad, clr.self);
  const squad = squadDef(member.squad);
  const primary = roleDef(member.unitRole);
  const sn = serviceNumber(member);
  const name = member.callsign ?? member.discordUsername;

  // --- Header: the jacket's cover sheet ------------------------------------ //
  const header = (
    <div className="relative mb-8">
      <div className="jacket-tab typed absolute -top-6 left-6 px-6 py-1 text-micro font-bold uppercase tracking-label">
        Personnel file · {sn}
      </div>
      <div className="jacket relative overflow-hidden rounded-lg border">
        <div className="absolute right-4 top-4 hidden sm:block">
          {currentLeave ? (
            <span className="stamp stamp-amber">On leave</span>
          ) : member.status === "DISCHARGED" ? (
            <span className="stamp">Discharged</span>
          ) : (
            <span className="stamp">Restricted</span>
          )}
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-[220px_1fr]">
          {/* ID card */}
          <div className="mx-auto w-full max-w-[200px] self-start rounded-md border border-foreground/15 bg-paper p-3 text-paper-ink md:mx-0 md:max-w-none shadow-lg">
            <div className="flex items-center justify-between text-micro font-bold uppercase tracking-label">
              <span>{UNIT.org}</span>
              <span>ID</span>
            </div>
            <Avatar discordId={member.discordId} avatar={member.avatar} name={name} size={196} className="mt-2 aspect-square h-auto w-full rounded-sm border-paper-ink/30 grayscale-[35%]" />
            <div className="mt-2 font-display text-lg font-bold uppercase leading-tight">{name}</div>
            <div className="typed text-micro uppercase">
              {member.rank ?? "—"} · {squad?.callsign ?? "Unassigned"}
            </div>
            <div className="typed text-micro">{sn}</div>
            <div className="barcode mt-2 h-6 w-full opacity-80" aria-hidden />
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-4 pr-0 sm:pr-32">
              <RankInsignia rank={member.rank} size={56} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-label text-accent">
                  {member.rank ? `${rankName(member.rank)} · ${path.current?.grade}` : "Personnel file"}
                </p>
                <h1 className="mt-1 text-3xl font-bold uppercase sm:text-4xl">
                  {member.rank && <span className="mr-2 text-muted-foreground">{member.rank}</span>}
                  {name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <MemberStatusBadge status={member.status} />
                  {currentLeave && (
                    <Badge variant="accent">
                      <CalendarOff /> LOA to {fmtDate(currentLeave.endDate!)}
                    </Badge>
                  )}
                  <span>@{member.discordUsername}</span>
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-foreground/10 py-4 sm:grid-cols-4">
              <Typed label="Element" value={squad ? `${squad.name} (${squad.callsign})` : "Unassigned"} />
              <Typed label="Billet / MOS" value={primary ? `${primary.name} · ${primary.code}` : "Unassigned"} />
              <Typed label="Secondary" value={member.secondaryRoles.join(", ") || "—"} />
              <Typed label="Enlisted" value={member.enlistedAt ? fmtDate(member.enlistedAt) : "—"} />
              <Typed label="Time in grade" value={path.daysInGrade === null ? "—" : `${path.daysInGrade} days`} />
              <Typed label="Ops attended" value={String(attended)} />
              <Typed label="Attendance" value={rate === null ? "—" : `${rate}%`} />
              <Typed label="Quals held" value={String(member.qualifications.length)} />
            </dl>

            {/* Ribbon rack: one bar per qualification. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {member.qualifications.map((q) => (
                <Link
                  key={q.id}
                  href={`/vault/${q.qualification.slug}`}
                  title={`${q.qualification.title} — ${fmtDate(q.awardedAt)}`}
                  className={cn("h-3 w-10 rounded-[2px] border border-black/40", RIBBON[q.qualification.category])}
                />
              ))}
              {!member.qualifications.length && <span className="text-xs text-muted-foreground">No ribbons awarded.</span>}
            </div>
          </div>
        </div>
        <div className="typed flex flex-wrap items-center justify-between gap-2 border-t border-foreground/10 bg-black/20 px-6 py-2 text-micro uppercase tracking-label text-muted-foreground">
          <span>
            Viewing clearance: <span className={clr.squad ? "text-accent" : ""}>{clr.label}</span>
          </span>
          <span>
            {UNIT.name} · S1 Personnel
          </span>
        </div>
      </div>
    </div>
  );

  // --- File (overview) ----------------------------------------------------- //
  const overview = (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-8">
        <Section title="Operator statement">
          {member.bio ? <p className="whitespace-pre-wrap text-sm">{member.bio}</p> : <Empty>No statement on file.</Empty>}
          {member.loadout && (
            <div className="mt-3">
              <div className="field-label">Preferred loadout</div>
              <p className="typed mt-1 text-sm">{member.loadout}</p>
            </div>
          )}
        </Section>

        <Section title="Availability" restricted={!clr.squad}>
          {clr.squad ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => (
                  <span
                    key={d}
                    className={cn(
                      "typed w-11 rounded-sm border py-1 text-center text-xs uppercase",
                      member.availability.includes(d) ? "border-success/50 bg-success/15 text-success-fg" : "text-muted-foreground",
                    )}
                  >
                    {d}
                  </span>
                ))}
              </div>
              <div className="typed text-sm text-muted-foreground">Timezone: {member.timezone ?? "not given"}</div>
            </div>
          ) : (
            <Redacted clearance="Squad leadership" lines={2} />
          )}
        </Section>

        <Section title="Deployment log">
          {member.attendances.length ? (
            <div className="flex flex-col gap-3">
              {/* Most recent on the left: one tile per op, coloured by outcome. */}
              <div className="flex flex-wrap gap-1">
                {member.attendances.map((a) => (
                  <Link
                    key={a.id}
                    href={`/ops/${a.eventId}`}
                    title={`${a.event.title} · ${fmtDate(a.event.startTime)} · ${ATTENDANCE_LABEL[a.status]}`}
                    className={cn("size-5 rounded-[2px] border border-black/30", TILE[a.status])}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-micro uppercase tracking-wider text-muted-foreground">
                {(["ATTENDING", "EXCUSED", "ABSENT", "NOSHOW"] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className={cn("size-2.5 rounded-[2px]", TILE[s])} /> {ATTENDANCE_LABEL[s]} {clr.squad || s === "ATTENDING" ? n(s) : ""}
                  </span>
                ))}
              </div>
              <div className="flex flex-col divide-y divide-foreground/10">
                {member.attendances.slice(0, 6).map((a) => (
                  <Link key={a.id} href={`/ops/${a.eventId}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-accent">
                    <span>
                      <span className="font-semibold">{a.event.title}</span>
                      <span className="typed ml-2 text-xs text-muted-foreground">{fmtDate(a.event.startTime)}</span>
                    </span>
                    {clr.squad || a.status === "ATTENDING" ? <AttendanceBadge status={a.status} /> : <RedactedBar className="w-16" />}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <Empty>No operations on record.</Empty>
          )}
        </Section>

        {clr.self && (
          <Section title="Update my file">
            <ActionForm action={updateOwnProfile}>
              <Field label="Operator statement" htmlFor="bio" help="A few lines for the roster: background, interests, what you bring.">
                <Textarea id="bio" name="bio" maxLength={1000} defaultValue={member.bio ?? ""} className="min-h-20" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Timezone" htmlFor="timezone">
                  <Input id="timezone" name="timezone" maxLength={60} defaultValue={member.timezone ?? ""} placeholder="e.g. US Eastern, GMT+1" />
                </Field>
                <Field label="Preferred loadout" htmlFor="loadout">
                  <Input id="loadout" name="loadout" maxLength={300} defaultValue={member.loadout ?? ""} placeholder="e.g. M4A1, ACOG, 8 mags" />
                </Field>
              </div>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="field-label mb-1.5">Usually available</legend>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <ChipCheckbox
                      key={d}
                      name="availability"
                      value={d}
                      defaultChecked={member.availability.includes(d)}
                      chipClassName="typed w-12 py-1.5 text-center uppercase"
                    >
                      {d}
                    </ChipCheckbox>
                  ))}
                </div>
              </fieldset>
              <SubmitButton size="sm" className="self-start">
                Save my file
              </SubmitButton>
            </ActionForm>
          </Section>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        <Section title="Qualifications">
          <div className="flex flex-col gap-3">
            {member.qualifications.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-2">
                <Link href={`/vault/${q.qualification.slug}`} className="flex items-center gap-2 hover:text-accent">
                  <span className={cn("h-3 w-6 rounded-[2px]", RIBBON[q.qualification.category])} />
                  <span className="text-sm font-semibold">{q.qualification.title}</span>
                </Link>
                <div className="flex items-center gap-1">
                  <span className="typed text-xs text-muted-foreground">{fmtDate(q.awardedAt)}</span>
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
            {!member.qualifications.length && <Empty>None yet.</Empty>}
            {isInstructor && allQuals.some((q) => !held.includes(q.slug)) && (
              <ActionForm action={awardQualification} className="mt-2 border-t border-foreground/10 pt-4">
                <input type="hidden" name="userId" value={member.id} />
                <Field label="Award qualification" htmlFor="qualificationId">
                  <Select id="qualificationId" name="qualificationId" required>
                    {allQuals
                      .filter((q) => !held.includes(q.slug))
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          [{q.category}] {q.title}
                        </option>
                      ))}
                  </Select>
                </Field>
                <SubmitButton size="sm">Award</SubmitButton>
              </ActionForm>
            )}
          </div>
        </Section>
      </div>
    </div>
  );

  // --- Service record -------------------------------------------------------- //
  const record = (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <RecordTimeline
        canDelete={isAdmin}
        records={records.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          description: r.description,
          date: fmtDate(r.createdAt),
          issuer: r.issuedBy ? (r.issuedBy.callsign ?? r.issuedBy.discordUsername) : null,
        }))}
      />
      {recordTypes.length > 0 && (
        <Section title="Add entry">
          <ActionForm action={addRecord}>
            <input type="hidden" name="userId" value={member.id} />
            <Field label="Type" htmlFor="type" help={recordTypes.includes("COUNSELING") ? "Counselling is seen by the member, their squad leadership and Command." : undefined}>
              <Select id="type" name="type">
                {recordTypes.map((t) => (
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
        </Section>
      )}
    </div>
  );

  // --- Career ---------------------------------------------------------------- //
  const careerPanel = (
    <div className="flex min-w-0 flex-col gap-8">
      <Section title="Rank progression">
        <ol className="flex gap-1 overflow-x-auto pb-2">
          {RANKS.map((r, i) => {
            const at = rankIndex(member.rank);
            const state = i < at ? "past" : i === at ? "current" : i === at + 1 ? "next" : "future";
            return (
              <li
                key={r.abbr}
                title={`${r.name} (${r.grade})`}
                className={cn(
                  "flex w-16 shrink-0 flex-col items-center gap-1 rounded-md border px-1 py-2",
                  state === "current" && "border-accent bg-accent/10",
                  state === "next" && "border-dashed border-accent/60",
                  state === "future" && "opacity-35",
                  state === "past" && "opacity-70",
                )}
              >
                <RankInsignia rank={r.abbr} size={28} className={state === "past" ? "text-muted-foreground" : undefined} />
                <span className="typed text-micro">{r.abbr}</span>
              </li>
            );
          })}
        </ol>
      </Section>
      <Section title={path.next ? `Next: ${path.next.name}` : "Promotion"} restricted={!clr.squad}>
        {!clr.squad ? (
          <Redacted clearance="Squad leadership" lines={4} />
        ) : !path.current ? (
          <Empty>Not yet ranked. Progression starts at enlistment.</Empty>
        ) : !path.next ? (
          <Empty>Highest rank in the unit structure.</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {!path.eligible ? (
                <span className="stamp stamp-amber">In progress</span>
              ) : path.needsApproval ? (
                <span className="stamp stamp-ok">Ready for review</span>
              ) : (
                <span className="stamp stamp-ok">Eligible</span>
              )}
              <span className="typed text-sm text-muted-foreground">
                {path.since ? `In grade since ${fmtDate(path.since)}` : "Time-in-grade not recorded"}
                {path.daysInService !== null && ` · ${path.daysInService} days in the PMC`}
              </span>
            </div>
            <ul className="flex flex-col gap-3">
              {path.checks.map((c) => (
                <li key={c.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      {c.ok ? <CheckCircle2 className="size-4 text-success-fg" /> : <Circle className="size-4 text-muted-foreground" />}
                      {c.detail === "qualification" ? `Qualification: ${c.label}` : c.label}
                    </span>
                    <span className="typed text-xs text-muted-foreground">
                      {c.detail === "approval"
                        ? "at promotion"
                        : c.detail === "qualification"
                          ? c.ok
                            ? "held"
                            : "required"
                          : `${Math.min(c.have, c.need)}/${c.need}`}
                    </span>
                  </div>
                  {!c.detail && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                      <div className={cn("h-full", c.ok ? "bg-success" : "bg-accent")} style={{ width: `${Math.min(100, (c.have / c.need) * 100)}%` }} />
                    </div>
                  )}
                </li>
              ))}
              {!path.checks.length && <Empty>No criteria set for this rank.</Empty>}
            </ul>
            <p className="text-xs text-muted-foreground">
              {path.next.typical && <>Usually reached about {path.next.typical} into service. </>}
              {path.needsApproval
                ? "Meeting the criteria puts a member up for leadership review; the promotion is leadership's call."
                : "Meeting the criteria makes a member eligible; promotion is at Command's discretion."}
            </p>
          </div>
        )}
      </Section>
    </div>
  );

  // --- Billet ---------------------------------------------------------------- //
  const billet = (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <Section title="Role eligibility">
        <ul className="flex flex-col divide-y divide-foreground/10">
          {ROLES.map((r) => {
            const missing = missingQuals(r.name, held);
            const holds = member.unitRole === r.name ? "Primary" : member.secondaryRoles.includes(r.name) ? "Secondary" : null;
            return (
              <li key={r.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  {missing.length ? <Lock className="size-3.5 text-muted-foreground" /> : <Crosshair className="size-3.5 text-success-fg" />}
                  <span className={cn("font-semibold", missing.length && "text-muted-foreground")}>{r.name}</span>
                  <span className="typed text-micro text-muted-foreground">{r.code}</span>
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  {holds ? <span className="text-accent">{holds}</span> : missing.length ? `Needs ${titles(missing).join(", ")}` : "Qualified"}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>
      {clr.self ? (
        <Section title="Request a billet">
          {member.status !== "ACTIVE" ? (
            <Empty>Only active members can request a billet.</Empty>
          ) : (
            <BilletPicker
              pending={pendingTypes.has("ROLE")}
              maxSecondary={MAX_SECONDARY_ROLES}
              current={{ squad: member.squad, primary: member.unitRole, secondary: member.secondaryRoles }}
              initial={{ squad: sp.squad, role: sp.role }}
              squads={SQUADS.map((s) => ({
                name: s.name,
                callsign: s.callsign,
                billets: Object.entries(s.billets).map(([role, cap]) => ({ role, cap, filled: fill.get(billetKey(s.name, role)) ?? 0 })),
              }))}
              roles={ROLES.map((r) => ({ name: r.name, code: r.code, blurb: r.blurb, missing: titles(missingQuals(r.name, held)) }))}
            />
          )}
        </Section>
      ) : (
        <Section title="Assignment">
          <dl className="grid grid-cols-2 gap-4">
            <Typed label="Element" value={squad?.name ?? "Unassigned"} />
            <Typed label="Primary" value={member.unitRole ?? "—"} />
            <Typed label="Secondary" value={member.secondaryRoles.join(", ") || "—"} />
            <Typed label="Element callsign" value={squad?.callsign ?? "—"} />
          </dl>
          <Link href="/roster" className="mt-4 inline-block text-sm text-accent underline-offset-4 hover:underline">
            View the roster by element
          </Link>
        </Section>
      )}
    </div>
  );

  // --- Requests -------------------------------------------------------------- //
  const requests = clr.squad && (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Section title="Personnel actions">
        <div className="flex flex-col gap-3">
          {member.requests.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              own={clr.self}
              showNotes
              decidable={canDecide(me, viewer, r, member)}
            />
          ))}
          {!member.requests.length && <Empty>No requests on file.</Empty>}
        </div>
      </Section>
      {clr.self && member.status === "ACTIVE" && (
        <div className="flex min-w-0 flex-col gap-8">
          <Section title="Leave of absence">
            <RequestForm action={requestLeave} pending={pendingTypes.has("LOA")} pendingNote="Your leave request is with leadership.">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First day" htmlFor="start">
                  <Input id="start" name="start" type="date" required />
                </Field>
                <Field label="Last day" htmlFor="end">
                  <Input id="end" name="end" type="date" required />
                </Field>
              </div>
              <Field label="Reason" htmlFor="loa-reason" help="Seen by your squad leadership and Command only.">
                <Textarea id="loa-reason" name="reason" required maxLength={500} className="min-h-16" />
              </Field>
              <p className="text-xs text-muted-foreground">Once approved you&apos;re excused from every event in the window.</p>
              <SubmitButton size="sm" className="self-start">
                Request leave
              </SubmitButton>
            </RequestForm>
          </Section>
          <Section title="Callsign change">
            <RequestForm action={requestCallsign} pending={pendingTypes.has("CALLSIGN")} pendingNote="Your callsign request is with Command.">
              <Field label="New callsign" htmlFor="new-callsign" help="Approved by Command. Your Discord nickname follows.">
                <Input id="new-callsign" name="callsign" required maxLength={24} placeholder={member.callsign ?? ""} />
              </Field>
              <Field label="Reason (optional)" htmlFor="cs-reason">
                <Input id="cs-reason" name="reason" maxLength={500} />
              </Field>
              <SubmitButton size="sm" className="self-start">
                Request change
              </SubmitButton>
            </RequestForm>
          </Section>
        </div>
      )}
    </div>
  );

  // --- Command --------------------------------------------------------------- //
  const command = isAdmin && (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <Section title="Edit file">
        <ActionForm action={updateProfile}>
          <input type="hidden" name="userId" value={member.id} />
          <div className="grid gap-4 sm:grid-cols-2">
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
            <Field label="Element" htmlFor="squad">
              <Select id="squad" name="squad" defaultValue={member.squad ?? ""}>
                <option value="">Unassigned</option>
                {SQUADS.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Primary billet" htmlFor="unitRole">
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
          </div>
          <fieldset>
            <legend className="field-label mb-1.5">Secondary roles (up to {MAX_SECONDARY_ROLES})</legend>
            <div className="flex flex-wrap gap-1.5">
              {UNIT_ROLES.map((r) => (
                <ChipCheckbox key={r} tone="info" name="secondaryRoles" value={r} defaultChecked={member.secondaryRoles.includes(r)}>
                  {r}
                </ChipCheckbox>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Rank, element and status changes are written to the service record automatically. The Discord nickname follows
            the rank and callsign, and squad / billet roles follow the assignment. Command may override billet caps and
            qualification gates here.
          </p>
          <SubmitButton size="sm" className="self-start">
            Save
          </SubmitButton>
        </ActionForm>
      </Section>
      <Section title="Identifiers">
        <dl className="flex flex-col gap-3">
          <Typed label="Service number" value={sn} />
          <Typed label="Discord ID" value={member.discordId} />
          <Typed label="Last sign-in" value={member.lastLoginAt ? fmt(member.lastLoginAt, "d MMM yyyy HH:mm") : "Never"} />
          <Typed label="File created" value={fmtDate(member.createdAt)} />
        </dl>
      </Section>
    </div>
  );

  const pendingCount = member.requests.filter((r) => r.status === "PENDING").length;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-12">
      {header}
      <FileTabs
        initial={sp.tab}
        tabs={[
          { id: "file", label: "File", content: overview },
          { id: "record", label: "Service record", content: record },
          { id: "career", label: "Career", content: careerPanel },
          { id: "billet", label: "Billet", content: billet },
          ...(requests ? [{ id: "requests", label: "Requests", badge: pendingCount, content: requests }] : []),
          ...(command ? [{ id: "command", label: "Command", content: command }] : []),
        ]}
      />
    </div>
  );
}

function Section({ title, restricted, children }: { title: string; restricted?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 border-b border-foreground/10 pb-2 text-sm font-semibold uppercase tracking-label">
        {title}
        {restricted && <Lock className="size-3.5 text-muted-foreground" />}
      </h2>
      {children}
    </section>
  );
}

function Typed({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="field-label">{label}</dt>
      <dd className="typed mt-0.5 truncate text-sm" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

const TILE: Record<string, string> = {
  ATTENDING: "bg-success",
  EXCUSED: "bg-accent/70",
  ABSENT: "bg-foreground/25",
  NOSHOW: "bg-destructive",
};

// Ribbon colours per qualification category.
const RIBBON: Record<string, string> = {
  WEAPONS: "bg-[linear-gradient(90deg,#7a1f1f_0_30%,#c9a227_30%_40%,#7a1f1f_40%_60%,#c9a227_60%_70%,#7a1f1f_70%)]",
  LEADERSHIP: "bg-[linear-gradient(90deg,#1f3a7a_0_35%,#e5e5e5_35%_45%,#1f3a7a_45%_55%,#e5e5e5_55%_65%,#1f3a7a_65%)]",
  MEDICAL: "bg-[linear-gradient(90deg,#e5e5e5_0_40%,#a32020_40%_60%,#e5e5e5_60%)]",
  PILOT: "bg-[linear-gradient(90deg,#3b6fb5_0_25%,#c9a227_25%_35%,#3b6fb5_35%_65%,#c9a227_65%_75%,#3b6fb5_75%)]",
  GENERAL: "bg-[linear-gradient(90deg,#4f6b2f_0_40%,#d4b483_40%_60%,#4f6b2f_60%)]",
};
