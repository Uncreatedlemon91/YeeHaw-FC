import { CheckCircle2, TriangleAlert } from "lucide-react";
import { ActionCard, ChecksCard, type Check } from "@/components/admin-parts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getChannelConfig } from "@/lib/channel-config";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getRoleConfig, roleConfigIsSaved } from "@/lib/role-config";
import { fmt } from "@/lib/time";
import { registerCommands, syncPlayers } from "./actions";

// The gateway checks in every 5 minutes; allow for one missed check-in.
const GATEWAY_STALE_MS = 11 * 60 * 1000;

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const channels = await getChannelConfig();
  const cfg = await getRoleConfig();
  const rolesSaved = await roleConfigIsSaved();
  const gatewayRow = await prisma.setting.findUnique({ where: { key: "gateway" } });
  const gateway = gatewayRow?.value as { at: string; tag: string; members: boolean } | undefined;
  const gatewayOnline = !!gateway && Date.now() - new Date(gateway.at).getTime() < GATEWAY_STALE_MS;
  const botReady = !!(env.botToken && env.guildId);

  const checks: Check[] = [
    { label: "Discord OAuth", ok: !!(env.clientId && process.env.DISCORD_CLIENT_SECRET), env: "DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET", hint: "Create an app in the Discord Developer Portal and copy its OAuth2 credentials." },
    { label: "Bot token", ok: !!env.botToken, env: "DISCORD_BOT_TOKEN", hint: "Developer Portal → Bot → Reset Token." },
    { label: "Guild", ok: !!env.guildId, env: "DISCORD_GUILD_ID", hint: "Enable Developer Mode in Discord, then right-click the server → Copy Server ID." },
    { label: "Interactions endpoint", ok: !!env.publicKey, env: "DISCORD_PUBLIC_KEY", hint: "Developer Portal → General Information → Public Key." },
    { label: "EA club", ok: !!env.eaClubId, env: "EA_CLUB_ID", hint: "The club's EA ID, for the stats poll." },
    { label: "Role mapping", ok: rolesSaved, env: "Discord roles & channels", hint: "Map the staff and member roles on the Discord roles & channels tab." },
    { label: "Management role", ok: !!(cfg.perms.MANAGEMENT.length || cfg.clubRoles.PRESIDENT || cfg.clubRoles.HEAD_COACH || env.adminUserIds.length), env: "Role mapping, or ADMIN_USER_IDS", hint: "Without one nobody can reach this page after their next role refresh." },
    { label: "Event channel", ok: !!channels.events, env: "Channels", hint: "Where fixtures are announced with RSVP buttons." },
    { label: "News channel", ok: !!channels.news, env: "Channels", optional: true, hint: "Only needed to announce articles." },
    { label: "Roster channel", ok: !!channels.roster, env: "Channels", optional: true, hint: "Squad changes and the season announcement." },
  ];

  return (
    <>
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
                Member events are off, so role changes won&apos;t update player records on their own. Turn on Server Members
                Intent (Developer Portal → Bot), then restart <code>yeehaw-gateway</code>.
              </p>
            )}
            {!gatewayOnline && (
              <p className="text-xs text-muted-foreground">
                {botReady ? "" : "Set the bot token and guild ID first. "}
                Then check <code>systemctl status yeehaw-gateway</code> and <code>journalctl -u yeehaw-gateway</code> on the server.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 font-mono text-micro font-semibold uppercase tracking-label text-muted-foreground">One-off actions</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <ActionCard
          title="Slash commands"
          description="Registers /fixtures and /squad on the server. Safe to repeat."
          action={registerCommands}
          label="Register commands"
          pendingText="Registering…"
          disabledReason={env.botToken ? undefined : "Needs DISCORD_BOT_TOKEN in .env."}
        />
        <ActionCard
          title="Player records from Discord"
          description="Opens a player record for everyone holding a mapped role, filling their name, avatar and club title. Existing records are only refreshed."
          action={syncPlayers}
          label="Sync players from Discord"
          pendingText="Syncing…"
          disabledReason={env.botToken ? undefined : "Needs DISCORD_BOT_TOKEN in .env."}
        />
      </div>
    </>
  );
}
