"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { APPLICATION_QUESTIONS } from "@/config/unit";
import { getSessionUser } from "@/lib/auth";
import { addRole } from "@/lib/discord";
import { env } from "@/lib/env";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { CALLSIGN_RE, postToBoard } from "@/lib/recruitment";
import { getRoleConfig } from "@/lib/role-config";
import { REAPPLY_DAYS } from "./rules";

// Built from the question list, so adding a question needs no change here.
const schema = z.object(
  Object.fromEntries(
    APPLICATION_QUESTIONS.map((q) => {
      let field: z.ZodTypeAny =
        q.type === "number"
          ? z.coerce.number({ invalid_type_error: `${q.label}: enter a number` }).int().min(13, "You must be at least 13 to use Discord.").max(99)
          : z.string().trim().max("max" in q ? q.max : 2000, `${q.label} is too long`);
      if (q.key === "callsign") field = z.string().trim().regex(CALLSIGN_RE, "Callsign: 2–24 letters, numbers, spaces or hyphens.");
      else if (q.required && q.type !== "number") field = (field as z.ZodString).min(1, `${q.label} is required`);
      else if (!q.required) field = field.optional();
      return [q.key, field];
    }),
  ),
);

export async function submitApplication(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (hasPerm(user.perms, "OPERATOR")) return { error: "You're already a member." };

  const parsed = schema.safeParse(Object.fromEntries(data));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: parsed.error.issues[0]?.message ?? "Check your answers.", fieldErrors };
  }

  const existing = await prisma.recruitmentApplication.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (existing?.status === "PENDING") return { error: "You already have an application under review." };
  if (existing?.status === "APPROVED") return { error: "Your application was already approved." };
  if (existing?.status === "DENIED" && Date.now() - existing.updatedAt.getTime() < REAPPLY_DAYS * 864e5)
    return { error: `You can reapply ${REAPPLY_DAYS} days after a decision.` };

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const app = await prisma.recruitmentApplication.create({
    data: {
      userId: user.id,
      discordId: dbUser.discordId,
      discordUsername: dbUser.discordUsername,
      answers: parsed.data,
    },
  });

  await postToBoard(app.id);
  // Mark them as a candidate on Discord too, so the approval's role swap has
  // something to remove. Best-effort: they may not have joined the server yet.
  const { candidate } = await getRoleConfig();
  if (candidate && env.botToken) {
    await addRole(dbUser.discordId, candidate, "Submitted an application").catch(() => {});
  }
  redirect("/apply?submitted=1");
}
