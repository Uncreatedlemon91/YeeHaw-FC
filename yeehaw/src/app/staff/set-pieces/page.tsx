import Link from "next/link";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SET_PIECE_KINDS, SET_PIECE_SIDES } from "@/config/club";
import { getSessionUser, requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { deleteSetPiece, saveSetPiece } from "./actions";

export const metadata = { title: "Set pieces" };
export const dynamic = "force-dynamic";

type Piece = { id: string; name: string; kind: string; side: string | null; takerId: string | null; routine: string | null; targets: string | null };
type Person = { id: string; displayName: string };

function PieceForm({ piece, people }: { piece?: Piece; people: Person[] }) {
  const id = piece?.id ?? "new";
  return (
    <ActionForm action={saveSetPiece as (p: ActionState, d: FormData) => Promise<ActionState>}>
      {piece && <input type="hidden" name="id" value={piece.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name" htmlFor={`name-${id}`}>
          <Input id={`name-${id}`} name="name" maxLength={60} required defaultValue={piece?.name} placeholder="e.g. Near-post flick" />
        </Field>
        <Field label="Kind" htmlFor={`kind-${id}`}>
          <Select id={`kind-${id}`} name="kind" defaultValue={piece?.kind}>
            {SET_PIECE_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="Side" htmlFor={`side-${id}`}>
          <Select id={`side-${id}`} name="side" defaultValue={piece?.side ?? ""}>
            <option value="">—</option>
            {SET_PIECE_SIDES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Taker" htmlFor={`taker-${id}`}>
          <Select id={`taker-${id}`} name="takerId" defaultValue={piece?.takerId ?? ""}>
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="The routine" htmlFor={`routine-${id}`}>
        <Textarea id={`routine-${id}`} name="routine" rows={3} maxLength={1500} defaultValue={piece?.routine ?? ""} placeholder="Who goes where, the signal, the delivery." />
      </Field>
      <Field label="Targets (optional)" htmlFor={`targets-${id}`}>
        <Input id={`targets-${id}`} name="targets" maxLength={200} defaultValue={piece?.targets ?? ""} placeholder="e.g. CB1 near post, ST far post" />
      </Field>
      <div>
        <SubmitButton pendingText="Saving…">{piece ? "Save" : "Add routine"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

// The routine book. Every member reads it; staff write it.
export default async function Page() {
  await requireUser("MEMBER", "/staff/set-pieces");
  const user = await getSessionUser();
  const isStaff = hasPerm(user?.perms, "STAFF");
  const [pieces, people] = await Promise.all([
    prisma.setPiece.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { taker: { select: { displayName: true, slug: true } } } }),
    isStaff
      ? prisma.player.findMany({
          where: { OR: [{ clubRole: { not: null } }, { contracts: { some: { state: "ACTIVE", season: { state: { in: ["WINDOW", "ACTIVE"] } } } } }] },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : [],
  ]);
  const kinds = [...SET_PIECE_KINDS, ...new Set(pieces.map((p) => p.kind).filter((k) => !(SET_PIECE_KINDS as readonly string[]).includes(k)))];

  return (
    <Container>
      <PageHeader eyebrow="Matchday" title="Set pieces" description="The club's routines: who takes them, what happens, and where everyone goes." />
      {!pieces.length && (
        <Card className="mb-6">
          <CardContent className="text-sm text-muted-foreground">No routines yet. Corners, free kicks and throw-ins the club has worked out will be listed here.{isStaff && " Add the first one below."}</CardContent>
        </Card>
      )}
      <div className="flex flex-col gap-8">
        {kinds.map((kind) => {
          const list = pieces.filter((p) => p.kind === kind);
          if (!list.length) return null;
          return (
            <section key={kind}>
              <h2 className="field-label mb-3">{kind}s</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {list.map((p) => (
                  <Card key={p.id}>
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>{p.name}</CardTitle>
                      {p.side && <span className="field-label">{p.side}</span>}
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                      <p>
                        <span className="field-label mr-2">Taker</span>
                        {p.taker ? (
                          <Link href={`/players/${p.taker.slug}`} className="text-accent underline underline-offset-2">
                            {p.taker.displayName}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </p>
                      {p.routine && <p className="whitespace-pre-wrap">{p.routine}</p>}
                      {p.targets && (
                        <p>
                          <span className="field-label mr-2">Targets</span>
                          {p.targets}
                        </p>
                      )}
                      {isStaff && (
                        <details className="mt-2 border-t pt-3">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-accent">Edit</summary>
                          <div className="mt-3 flex flex-col gap-3">
                            <PieceForm piece={p} people={people} />
                            <ActionForm action={deleteSetPiece as (p: ActionState, d: FormData) => Promise<ActionState>}>
                              <input type="hidden" name="id" value={p.id} />
                              <div>
                                <ConfirmButton variant="outline" size="sm" message="Delete this routine?">
                                  Delete routine
                                </ConfirmButton>
                              </div>
                            </ActionForm>
                          </div>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
        {isStaff && (
          <Card>
            <CardHeader>
              <CardTitle>Add a routine</CardTitle>
            </CardHeader>
            <CardContent>
              <PieceForm people={people} />
            </CardContent>
          </Card>
        )}
      </div>
    </Container>
  );
}
