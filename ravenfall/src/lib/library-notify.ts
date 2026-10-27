import type { LibraryClearance } from "@prisma/client";
import { UNIT } from "@/config/unit";
import { getChannelConfig } from "./channel-config";
import { dm, explain, linkButton, row, sendMessage } from "./discord";
import { env } from "./env";
import { prisma } from "./prisma";
import { isRequiredOf, isTargeted, type DocTargets, type Reader } from "./required-reading";

// Discord side of the library: an announcement embed, and a DM to each member
// a document has just become required of. Both run after the save and never
// fail it: callers use notifyLater, which logs instead of throwing.

/** Only these tiers are ever posted to a channel; Leadership and Command stay off Discord's shared channels. */
const ANNOUNCED: readonly LibraryClearance[] = ["PUBLIC", "UNIT"];

/** DMs per publish, and the pause between them, to stay well inside Discord's limits. */
const DM_CAP = 150;
const DM_DELAY_MS = 400;

type NotifyDoc = DocTargets & { id: string; slug: string; title: string; summary: string; clearance: LibraryClearance; ackVersion: number };

const link = (d: Pick<NotifyDoc, "slug">) => `${env.siteUrl}/library/${d.slug}`;

/** Fire and forget: run after the DB write, log anything that goes wrong. */
export function notifyLater(label: string, job: () => Promise<void>) {
  void job().catch((e) => console.error(`[library] ${label}: ${explain(e)}`));
}

function targetSummary(d: DocTargets): string {
  if (d.requiredEveryone) return "everyone";
  const parts = [
    d.requiredMinRank && `${d.requiredMinRank} and above`,
    d.requiredRanks.length && d.requiredRanks.join(", "),
    d.requiredRoles.length && d.requiredRoles.join(", "),
    d.requiredSquads.length && `${d.requiredSquads.join(", ")} squad${d.requiredSquads.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.join(" · ") || "no one yet";
}

/** Post a new or majorly-updated document to the library channel (Public / Unit only). */
export async function announceDoc(doc: NotifyDoc, kind: "published" | "updated") {
  if (!env.botToken || !ANNOUNCED.includes(doc.clearance)) return;
  const { library: channel } = await getChannelConfig();
  if (!channel) return;
  await sendMessage(channel, {
    embeds: [
      {
        title: `${kind === "published" ? "New document" : "Updated document"}: ${doc.title}`,
        url: link(doc),
        description: doc.summary || undefined,
        color: doc.required ? 0x9b2c2c : 0x4f7a3a,
        fields: [
          ...(doc.required
            ? [
                {
                  name: "Required reading",
                  value: `Required of ${targetSummary(doc)}.${kind === "updated" ? " This is a major update: acknowledge it again." : ""}`,
                  inline: false,
                },
              ]
            : []),
        ],
        footer: { text: `${UNIT.siteName} · Library` },
      },
    ],
    components: [row(linkButton("Read it", link(doc)))],
    allowed_mentions: { parse: [] },
  });
}

/**
 * DM the members `doc` has newly become required of. With `prev` (the
 * document as it was before the save) only people it didn't already cover
 * are asked, unless `major`, which asks every targeted member again. Members
 * who already acknowledged the current version are left alone.
 */
export async function dmNewlyRequired(doc: NotifyDoc, prev: DocTargets | null, major: boolean) {
  if (!env.botToken || !doc.required) return;
  const members = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, discordId: true, status: true, rank: true, unitRole: true, secondaryRoles: true, squad: true },
  });
  const acked = new Set(
    (await prisma.libraryAcknowledgement.findMany({ where: { documentId: doc.id, ackVersion: doc.ackVersion }, select: { userId: true } })).map(
      (a) => a.userId,
    ),
  );
  const affected = members.filter(
    (m: Reader) => isRequiredOf(doc, m) && !acked.has(m.id) && (major || !prev || !isTargeted(prev, m)),
  );
  if (affected.length > DM_CAP) console.warn(`[library] ${doc.slug}: ${affected.length} members affected, messaging the first ${DM_CAP}.`);

  const text =
    `**${doc.title}** is now required reading for you` + (major && prev?.required ? " (major update, please acknowledge it again)" : "") + `.\n` +
    `Read it and press "I have read and understood": ${link(doc)}`;
  let failed = 0;
  for (const m of affected.slice(0, DM_CAP)) {
    await dm(m.discordId, text).catch((e) => {
      failed++;
      console.error(`[library] DM to ${m.discordId} failed: ${explain(e)}`);
    });
    await new Promise((r) => setTimeout(r, DM_DELAY_MS));
  }
  if (failed) console.warn(`[library] ${doc.slug}: ${failed} of ${Math.min(affected.length, DM_CAP)} DMs failed (members may have DMs closed).`);
}
