import type { Captaincy, Position, SquadStatus } from "@prisma/client";

// What the pitch and bench components draw. Plain data (no Prisma) so client
// components can import the types.

export type BoardPlayer = {
  /** Item key: a player's id on the lineup, "p:<id>" / "n:<name>" on tactics. */
  key: string;
  name: string;
  discordId: string;
  avatar: string | null;
  /** Hub link; none for a free-text name. */
  slug?: string;
  number?: number | null;
  captaincy?: Captaincy;
  position?: Position | null;
  status?: SquadStatus;
};

export type BoardSlots = Record<string, BoardPlayer | null | undefined>;
