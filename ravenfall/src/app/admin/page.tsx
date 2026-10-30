import { CheckCircle2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { ActionCard, AdminCallout, ChecksCard, type Check } from "@/components/admin-parts";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
  OPERATOR: "Unit member: ops, roster, S1 desk, library, Hall of Honour.",
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

  const botReady = !!(env.botToken && env.guildId);
  const checks: Check[] = [
    { label: "Discord OAuth", ok: !!(env.clientId && process.env.DISCORD_CLIENT_SECRET), env: "DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET", hint: "Create an app in the Discord Developer Portal and copy its OAuth2 credentials." },
    { label: "Bot token", ok: !!env.botToken, env: "DISCORD_BOT_TOKEN", hint: "Developer Portal → Bot → Reset Token." },
    { label: "Guild", ok: !!env.guildId, env: "DISCORD_GUILD_ID", hint: "Enable Developer Mode in Discord, then right-click the server → Copy Server ID." },
    { label: "Interactions endpoint", ok: !!env.publicKey, env: "DISCORD_PUBLIC_KEY", hint: "Developer Portal → General Information → Public Key." },
    { label: "Recruitment board", ok: !!channels.board, env: "Channels below", hint: "Pick a channel in Discord channels." },
    { label: "Welcome channel", ok: !!channels.welcome, env: "Channels below", hint: "Pick a channel in Discord channels." },
    { label: "Ops announcements", ok: !!channels.ops, env: "Channels below", optional: true, hint: "Only needed to announce new operations." },
    { label: "Personnel board", ok: !!channels.personnel, env: "Channels below", optional: true, hint: "Only needed for billet, callsign and leave requests." },
    { label: "Library announcements", ok: !!channels.library, env: "Channels below", optional: true, hint: "Only needed to announce library documents." },
    { label: "Recruit role", ok: !!cfg.recruit, env: "Role mapping below", hint: "Map it under Discord role mapping → Recruitment." },
    { label: "Candidate role", ok: !!cfg.candidate, env: "Role mapping below", hint: "Map it under Discord role mapping → Recruitment." },
  ];

  return (
    <Container>
      <PageHeader
        eyebrow="Command"
        title="Admin"
        description="Discord integration status and one-off setup actions."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/awards">Awards editor</Link>
          </Button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <ChecksCard checks={checks} />

        <Card>
          <CardHeader>
            <CardTitle>Bot status</CardTitle>
            <CardDescription>The gateway service keeps the bot online and watches for role changes.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <span className={`flex items-center gap-2 font-medium ${gatewayOnline ? "text-success-fg" : "text-warning"}`}>
              {gatewayOnline ? <CheckCircle2 className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
              {gatewayOnline ? `Online as ${gateway!.tag}` : gateway ? "Offline" : "Never connected"}
            </span>
            {gateway && <span className="text-xs text-muted-foreground">Last check-in {fmt(new Date(gateway.at))}</span>}
            {gatewayOnline && !gateway!.members && (
              <p className="text-xs text-accent">
                Member events are off, so role changes won&apos;t update personnel files on their own. Turn on Server Members
                Intent (Developer Portal → Bot), then restart <code>ravenfall-gateway</code>.
              </p>
            )}
            {!gatewayOnline && (
              <p className="text-xs text-muted-foreground">
                {botReady ? "" : "Set the bot token and guild ID first. "}
                Then check <code>systemctl status ravenfall-gateway</code> and <code>journalctl -u ravenfall-gateway</code> on the server.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-micro font-semibold uppercase tracking-label text-muted-foreground">One-off actions</h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          title="Recruitment message"
          description="Posts an embed with a persistent Enlist Now button to the welcome channel."
          action={postRecruitmentMessage}
          label="Post to welcome channel"
          pendingText="Posting…"
          variant="default"
          disabledReason={channels.welcome ? undefined : "Pick a welcome channel under Discord channels first."}
        />
        <ActionCard
          title="Slash commands"
          description="Registers /enlist and /ops on the server. Safe to repeat."
          action={registerCommands}
          label="Register commands"
          pendingText="Registering…"
          disabledReason={env.botToken ? undefined : "Needs DISCORD_BOT_TOKEN in .env."}
        />
        <ActionCard
          title="Personnel files from Discord"
          description="Opens a personnel file for every member holding a mapped role, filling rank, squad, billets and callsign from their roles and nickname. Existing files only get blanks filled."
          action={syncProfiles}
          label="Sync profiles from Discord"
          pendingText="Syncing…"
          disabledReason={env.botToken ? undefined : "Needs DISCORD_BOT_TOKEN in .env."}
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Discord channels</CardTitle>
          <CardDescription>
            Where the bot posts. The bot needs View Channel, Send Messages and Embed Links in each one.
            {!channelsSaved && " Not saved yet: showing the *_CHANNEL_ID values from .env. Once saved here, those .env lines are ignored."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {channelsError ? (
            <AdminCallout tone="warning" title="Couldn't load channels">{channelsError}</AdminCallout>
          ) : channelGroups.length ? (
            <ChannelForm
              key={JSON.stringify(channels)}
              groups={channelGroups}
              initial={channels}
              targets={[
                { key: "board", label: "Recruitment board", help: "New applications, with Approve / Deny. Recruiters only." },
                { key: "welcome", label: "Welcome channel", help: "Where “Post to welcome channel” puts the Enlist Now message." },
                { key: "ops", label: "Ops announcements", help: "New operations, if the scheduler ticks Announce." },
                { key: "personnel", label: "Personnel board", help: "Billet, callsign and leave requests. Leadership only." },
                { key: "library", label: "Library announcements", help: "New Public and Unit documents, and major updates to required reading." },
              ]}
            />
          ) : (
            <AdminCallout title="Connect the bot to load channels">
              Set <code>DISCORD_BOT_TOKEN</code> and <code>DISCORD_GUILD_ID</code> in .env and restart the site; the server&apos;s text channels will be listed here.
            </AdminCallout>
          )}
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Discord role mapping</CardTitle>
          <CardDescription>
            Which Discord roles mean what on the site.
            {!saved && " Not saved yet: showing the ROLE_* values from .env. Once saved here, those .env lines are ignored."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rolesError ? (
            <AdminCallout tone="warning" title="Couldn't load roles">{rolesError}</AdminCallout>
          ) : roles.length ? (
            <RoleMappingForm
              key={JSON.stringify(cfg)}
              roles={roles.map((r) => ({ id: r.id, name: r.name, color: r.color }))}
              perms={(Object.keys(PERM_LABELS) as Perm[]).map((p) => ({ key: p, label: PERM_LABELS[p], help: PERM_HELP[p] }))}
              initial={cfg}
              ranks={[...RANKS].reverse().map((r) => ({ key: r.abbr, label: `${r.abbr} · ${r.name}` }))}
              squads={SQUADS.map((q) => ({ key: q.name, label: q.name }))}
              billets={ROLES.map((r) => ({ key: r.name, label: r.name }))}
            />
          ) : (
            <AdminCallout title="Connect the bot to load roles">
              Set <code>DISCORD_BOT_TOKEN</code> and <code>DISCORD_GUILD_ID</code> in .env and restart the site; the server&apos;s roles will be listed here.
            </AdminCallout>
          )}
        </CardContent>
      </Card>

    </Container>
  );
}
