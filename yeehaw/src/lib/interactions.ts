import { NextResponse } from "next/server";
import { permsFromRoles, type Perm } from "./permissions";
import { getRoleConfig } from "./role-config";

// Shared pieces for the interactions endpoint (src/app/api/discord/
// interactions/route.ts) and the handlers each feature adds to it. Route
// files may only export HTTP methods, so these live here.

export const EPHEMERAL = 64;
export const T = { PING: 1, COMMAND: 2, COMPONENT: 3, MODAL_SUBMIT: 5 } as const;
export const R = { PONG: 1, MESSAGE: 4, DEFERRED_MESSAGE: 5, MODAL: 9 } as const;

export type Interaction = {
  type: number;
  token: string;
  guild_id?: string;
  data?: {
    name?: string;
    custom_id?: string;
    components?: { components: { custom_id: string; value: string }[] }[];
  };
  member?: { roles: string[]; nick?: string | null; user: { id: string; username: string; global_name?: string | null; avatar?: string | null } };
  user?: { id: string; username: string; global_name?: string | null; avatar?: string | null };
};

export const reply = (content: string, extra: object = {}) =>
  NextResponse.json({ type: R.MESSAGE, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });

export const modal = (data: object) => NextResponse.json({ type: R.MODAL, data });
export const deferred = () => NextResponse.json({ type: R.DEFERRED_MESSAGE, data: { flags: EPHEMERAL } });

/** The clicker's site permissions, worked out from the roles Discord sent with the interaction. */
export async function permsOf(i: Interaction): Promise<Perm[]> {
  const id = i.member?.user.id ?? i.user?.id;
  return permsFromRoles(i.member?.roles ?? [], id, await getRoleConfig(), { inGuild: !!i.member });
}

