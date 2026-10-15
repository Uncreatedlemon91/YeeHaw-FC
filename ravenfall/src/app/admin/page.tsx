import { CheckCircle2, XCircle } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RANKS, ROLES, SQUADS } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { explain, listRoles, listTextChannels, type Role } from "@/lib/discord";
import { env } from "@/lib/env";
import { PERM_LABELS, type Perm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { channelConfigIsSaved, getChannelConfig } from "@/lib/channel-config";
import { getRoleConfig, roleConfigIsSaved } from "@/lib/role-config";
import { fmt } from "@/lib/time";
import { postRecruitmentMessage, registerCommands, syncProfiles } from "./actions";
import { ChannelForm, type ChannelGroup } from "./channel-form";
import { RoleMappingForm } from "./role-mapping-form";

const PERM_HELP: Record<Perm, string> = {
  ADMIN: "Everything, including this page.",
  RECRUITER: "Decides applications.",
  INSTRUCTOR: "Runs training and awards qualifications.",
  OPERATOR: "Unit member: ops, roster, S1 desk, vault.",
};

// The gateway checks in every 5 minutes; allow for one missed check-in.
const GATEWAY_STALE_MS = 11 * 60 * 1000;

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function Admin() {
  await requireUser("ADMIN", "/admin");

  let roles: Role[] = [];
  let rolesError: string | null = null;
  let channelGroups: ChannelGroup[] = [];
  let channelsError: string | null = null;
  if (env.botToken && env.guildId) {
    try {
      roles = (await listRoles()).filter((r) => !r.managed && r.name !== "@everyone").sort((a, b) => b.position - a.position);
    } catch (e) {
      rolesError = explain(e);
    }
    try {
      channelGroups = await listTextChannels();
    } catch (e) {
      channelsError = explain(e);
    }
  }
  const channels = await getChannelConfig();
  const channelsSaved = await channelConfigIsSaved();
  const cfg = await getRoleConfig();
  const saved = await roleConfigIsSaved();
  const gatewayRow = await prisma.setting.findUnique({ where: { key: "gateway" } });
  const gateway = gatewayRow?.value as { at: string; tag: string; members: boolean } | undefined;
  const gatewayOnline = !!gateway && Date.now() - new Date(gateway.at).getTime() < GATEWAY_STALE_MS;

  const checks: [string, boolean, string][] = [
    ["Discord OAuth", !!(env.clientId && process.env.DISCORD_CLIENT_SECRET), "DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET"],
    ["Bot token", !!env.botToken, "DISCORD_BOT_TOKEN"],
    ["Guild", !!env.guildId, "DISCORD_GUILD_ID"],
    ["Interactions endpoint", !!env.publicKey, "DISCORD_PUBLIC_KEY"],
    ["Recruitment board", !!channels.board, "channels below"],
    ["Welcome channel", !!channels.welcome, "channels below"],
    ["Ops announcements (optional)", !!channels.ops, "channels below"],
    ["Personnel board (optional)", !!channels.personnel, "channels below"],
    ["Recruit role", !!cfg.recruit, "role mapping below"],
    ["Candidate role", !!cfg.candidate, "role mapping below"],
  ];

  return (
    <Container className="max-w-5xl">
      <PageHeader eyebrow="Command" title="Admin" description="Discord integration status and one-off setup actions." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Credentials live in the server&apos;s .env (restart the site after changing it). Roles and channels are set below.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {checks.map(([label, ok, key]) => (
              <div key={label} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  {ok ? <CheckCircle2 className="size-4 text-green-400" /> : <XCircle className="size-4 text-red-400" />}
                  {label}
                </span>
                <code className="text-xs text-muted-foreground">{key}</code>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bot status</CardTitle>
            <CardDescription>The gateway service keeps the bot online and watches for role changes.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2">
              {gatewayOnline ? <CheckCircle2 className="size-4 text-green-400" /> : <XCircle className="size-4 text-red-400" />}
              {gatewayOnline ? `Online as ${gateway!.tag}` : "Offline"}
            </span>
            {gateway && (
              <span className="text-xs text-muted-foreground">Last check-in {fmt(new Date(gateway.at))}</span>
            )}
            {gatewayOnline && !gateway!.members && (
              <p className="text-xs text-accent">
                Member events are off, so role changes won&apos;t update personnel files on their own. Turn on Server Members
                Intent (Developer Portal → Bot), then restart <code>ravenfall-gateway</code>.
              </p>
            )}
            {!gatewayOnline && (
              <p className="text-xs text-muted-foreground">
                Check <code>systemctl status ravenfall-gateway</code> and <code>journalctl -u ravenfall-gateway</code> on the server.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recruitment message</CardTitle>
            <CardDescription>Posts an embed with a persistent Enlist Now button to the welcome channel.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={postRecruitmentMessage}>
              <SubmitButton variant="accent" className="self-start" disabled={!channels.welcome}>
                Post to welcome channel
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Slash commands</CardTitle>
            <CardDescription>Registers /enlist and /ops on the server. Safe to repeat.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={registerCommands}>
              <SubmitButton variant="secondary" className="self-start" disabled={!env.botToken}>
                Register commands
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Discord channels</CardTitle>
          <CardDescription>
            Where the bot posts. The bot needs View Channel, Send Messages and Embed Links in each one.
            {!channelsSaved && " Not saved yet: showing the *_CHANNEL_ID values from .env. Once saved here, those .env lines are ignored."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {channelsError ? (
            <p className="text-sm text-red-300">{channelsError}</p>
          ) : channelGroups.length ? (
            <ChannelForm
              groups={channelGroups}
              initial={channels}
              targets={[
                { key: "board", label: "Recruitment board", help: "New applications, with Approve / Deny. Recruiters only." },
                { key: "welcome", label: "Welcome channel", help: "Where “Post to welcome channel” puts the Enlist Now message." },
                { key: "ops", label: "Ops announcements", help: "New operations, if the scheduler ticks Announce." },
                { key: "personnel", label: "Personnel board", help: "Billet, callsign and leave requests. Leadership only." },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Set the bot token and guild ID to load the server&apos;s channels.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Discord role mapping</CardTitle>
          <CardDescription>
            Which Discord roles mean what on the site.
            {!saved && " Not saved yet: showing the ROLE_* values from .env. Once saved here, those .env lines are ignored."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rolesError ? (
            <p className="text-sm text-red-300">{rolesError}</p>
          ) : roles.length ? (
            <RoleMappingForm
              roles={roles.map((r) => ({ id: r.id, name: r.name, color: r.color }))}
              perms={(Object.keys(PERM_LABELS) as Perm[]).map((p) => ({ key: p, label: PERM_LABELS[p], help: PERM_HELP[p] }))}
              initial={cfg}
              ranks={[...RANKS].reverse().map((r) => ({ key: r.abbr, label: `${r.abbr} · ${r.name}` }))}
              squads={SQUADS.map((q) => ({ key: q.name, label: q.name }))}
              billets={ROLES.map((r) => ({ key: r.name, label: r.name }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Set the bot token and guild ID to load the server&apos;s roles.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Personnel files from Discord</CardTitle>
          <CardDescription>
            Opens a personnel file for every server member holding a mapped role, with rank, squad and billets read from
            their roles and the callsign from their nickname. Existing files only have their blanks filled. With the bot
            online this also happens on its own whenever someone&apos;s roles change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={syncProfiles}>
            <SubmitButton variant="secondary" className="self-start" disabled={!env.botToken} pendingText="Syncing…">
              Sync profiles from Discord
            </SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </Container>
  );
}
