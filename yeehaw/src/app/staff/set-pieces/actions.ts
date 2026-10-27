"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSetPiece } from "@/lib/set-piece-rules";

const str = (d: FormData, k: string) => String(d.get(k) ?? "");
const refresh = () => revalidatePath("/staff/set-pieces");

/** Add a routine (no id) or edit one. Staff only. */
export async function saveSetPiece(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const r = parseSetPiece({ name: str(data, "name"), kind: str(data, "kind"), side: str(data, "side"), takerId: str(data, "takerId"), routine: str(data, "routine"), targets: str(data, "targets") });
  if (!r.ok) return { error: r.error, fieldErrors: { [r.field]: r.error } };
  const { takerId, ...rest } = r.value;
  if (takerId && !(await prisma.player.findUnique({ where: { id: takerId }, select: { id: true } }))) return { error: "That taker no longer exists.", fieldErrors: { takerId: "Pick someone from the list." } };
  const id = str(data, "id");
  if (id) {
    if (!(await prisma.setPiece.findUnique({ where: { id }, select: { id: true } }))) return { error: "That routine was already deleted." };
    await prisma.setPiece.update({ where: { id }, data: { ...rest, takerId, updatedBy: user.name } });
  } else {
    const top = await prisma.setPiece.aggregate({ _max: { position: true } });
    await prisma.setPiece.create({ data: { ...rest, takerId, position: (top._max.position ?? 0) + 1, updatedBy: user.name } });
  }
  refresh();
  return { ok: id ? "Saved." : "Routine added." };
}

export async function deleteSetPiece(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  await prisma.setPiece.deleteMany({ where: { id: str(data, "id") } });
  refresh();
  return { ok: "Deleted." };
}
