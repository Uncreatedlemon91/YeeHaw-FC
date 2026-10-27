import type { Captaincy, ObjectiveKind, Position, SquadStatus } from "@prisma/client";
import { CLUB, OBJECTIVE_LABEL, POSITION_LABEL, SQUAD_STATUSES, SQUAD_STATUS_LABEL, SQUAD_STATUS_LONG } from "@/config/club";
import { ButtonStyle, row } from "./discord";
import { env } from "./env";
import { discordTime } from "./time";

// What the bot says about contracts: the offer with its Accept / Decline
// buttons, the squad announcement, departures. Plain builders, no I/O.

const RED = 0xd4142f;
const NAVY = 0x14233f;

export type TermsView = {
  shirtNumber: number | null;
  squadStatus: SquadStatus;
  position: Position | null;
  secondaryPosition: Position | null;
  captaincy: Captaincy;
  objectives: { kind: ObjectiveKind; target: number }[];
};

const CAPTAINCY: Record<Captaincy, string> = { NONE: "", CAPTAIN: "Captain", VICE: "Vice-captain" };

function positions(t: Pick<TermsView, "position" | "secondaryPosition">): string {
  return [t.position, t.secondaryPosition].filter((p): p is Position => !!p).map((p) => POSITION_LABEL[p]).join(" / ");
}

function objectiveLine(o: { kind: ObjectiveKind; target: number }): string {
  const unit = o.kind === "ATTENDANCE" ? "%" : "";
  return `${OBJECTIVE_LABEL[o.kind]}: ${o.target}${unit}`;
}

/** The terms as embed fields. */
export function termsFields(t: TermsView) {
  const fields = [
    { name: "Shirt", value: t.shirtNumber != null ? `#${t.shirtNumber}` : "To be assigned", inline: true },
    { name: "Squad status", value: SQUAD_STATUS_LONG[t.squadStatus], inline: true },
    { name: "Position", value: positions(t) || "Any", inline: true },
  ];
  if (t.captaincy !== "NONE") fields.push({ name: "Armband", value: CAPTAINCY[t.captaincy], inline: true });
  if (t.objectives.length) fields.push({ name: "Objectives", value: t.objectives.map(objectiveLine).join("\n"), inline: false });
  return fields;
}

export type OfferView = {
  contractId: string;
  seasonName: string;
  seasonStartsAt: Date;
  playerDiscordId: string;
  terms: TermsView;
  /** Who made the offer, for the footer. */
  offeredBy?: string | null;
};

export const offerButtons = (contractId: string) =>
  row(
    { type: 2, style: ButtonStyle.Success, label: "Accept", custom_id: `ct:accept:${contractId}` },
    { type: 2, style: ButtonStyle.Danger, label: "Decline", custom_id: `ct:decline:${contractId}` },
  );

/** The offer, as a DM (no mention) or a channel post (`mention`). */
export function offerMessage(o: OfferView, opts: { mention?: boolean } = {}) {
  return {
    content: opts.mention ? `<@${o.playerDiscordId}>` : undefined,
    allowed_mentions: opts.mention ? { users: [o.playerDiscordId] } : { parse: [] },
    embeds: [
      {
        title: `${CLUB.name}: contract offer for ${o.seasonName}`,
        description: `We'd like you in the squad for **${o.seasonName}**, starting ${discordTime(o.seasonStartsAt, "f")}. Only you can answer this offer.`,
        color: RED,
        fields: termsFields(o.terms),
        footer: o.offeredBy ? { text: `Offered by ${o.offeredBy}` } : undefined,
      },
    ],
    components: [offerButtons(o.contractId)],
  };
}

/** The offer after it has been answered: same embed, buttons gone, outcome shown. */
export function answeredOffer(o: OfferView, decision: "accept" | "decline") {
  const base = offerMessage(o);
  const accepted = decision === "accept";
  return {
    content: base.content,
    allowed_mentions: base.allowed_mentions,
    embeds: [
      {
        ...base.embeds[0],
        color: accepted ? 0x2f9e63 : NAVY,
        description: accepted
          ? `Accepted. You're under contract for **${o.seasonName}**. Welcome to the squad.`
          : `Declined. The offer for **${o.seasonName}** is closed.`,
      },
    ],
    components: [],
  };
}

/** The offer taken back by management. */
export function withdrawnOffer(o: OfferView) {
  const base = offerMessage(o);
  return {
    content: base.content,
    allowed_mentions: base.allowed_mentions,
    embeds: [{ ...base.embeds[0], color: NAVY, description: `This offer for **${o.seasonName}** was withdrawn.` }],
    components: [],
  };
}

export type SquadRow = {
  name: string;
  shirtNumber: number | null;
  squadStatus: SquadStatus;
  position: Position | null;
  captaincy: Captaincy;
};

const line = (r: SquadRow) =>
  `${r.shirtNumber != null ? `**${r.shirtNumber}**` : "·"} ${r.name}${r.position ? ` — ${POSITION_LABEL[r.position]}` : ""}${r.captaincy === "CAPTAIN" ? " (C)" : r.captaincy === "VICE" ? " (VC)" : ""}`;

const FIELD_MAX = 1000;

/** Split lines into chunks under Discord's 1024-character field limit. */
export function chunkLines(lines: string[], max = FIELD_MAX): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const l of lines) {
    if (cur && cur.length + l.length + 1 > max) {
      chunks.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** The season-start squad announcement: numbers, positions, armbands. */
export function squadAnnouncement(seasonName: string, rows: SquadRow[]) {
  const byNumber = (a: SquadRow, b: SquadRow) =>
    (a.shirtNumber ?? 1000) - (b.shirtNumber ?? 1000) || a.name.localeCompare(b.name);
  const fields = [];
  const armbands = rows.filter((r) => r.captaincy !== "NONE").sort((a) => (a.captaincy === "CAPTAIN" ? -1 : 1));
  if (armbands.length)
    fields.push({ name: "Armbands", value: armbands.map((r) => `${r.captaincy === "CAPTAIN" ? "Captain" : "Vice-captain"}: ${r.name}`).join("\n"), inline: false });
  for (const status of SQUAD_STATUSES) {
    const lines = rows.filter((r) => r.squadStatus === status).sort(byNumber).map(line);
    chunkLines(lines).forEach((value, i) =>
      fields.push({ name: i === 0 ? `${SQUAD_STATUS_LABEL[status]} (${lines.length})` : `${SQUAD_STATUS_LABEL[status]} (cont.)`, value, inline: false }),
    );
  }
  return {
    embeds: [
      {
        title: `${CLUB.name}: the ${seasonName} squad`,
        description: rows.length ? `${rows.length} players under contract.` : "No one is under contract yet.",
        url: `${env.siteUrl}/squad`,
        color: RED,
        fields: fields.slice(0, 25),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

export function signingPost(name: string, seasonName: string, t: TermsView) {
  return {
    embeds: [
      {
        title: `${name} signs for ${CLUB.name}`,
        description: `${name} accepted a contract for **${seasonName}**.`,
        color: 0x2f9e63,
        fields: termsFields(t),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

export function departurePost(name: string, seasonName: string, note?: string | null) {
  return {
    embeds: [
      {
        title: `${name} has left ${CLUB.name}`,
        description: `${name}'s contract for **${seasonName}** has ended.${note ? `\n\n${note}` : ""}`,
        color: NAVY,
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

export function changeDm(seasonName: string, lines: string[]): string {
  return `Your ${CLUB.name} contract for ${seasonName} was updated:\n${lines.map((l) => `• ${l}`).join("\n")}`;
}
