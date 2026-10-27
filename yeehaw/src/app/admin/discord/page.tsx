import { AdminCallout } from "@/components/admin-parts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CLUB_ROLE_LABEL, SQUAD_STATUS_LABEL } from "@/config/club";
import { channelConfigIsSaved, getChannelConfig } from "@/lib/channel-config";
import { explain, listRoles, listTextChannels, type Role } from "@/lib/discord";
import { env } from "@/lib/env";
import { PERM_LABELS, PERMS, type Perm } from "@/lib/permissions";
import { getRoleConfig, roleConfigIsSaved } from "@/lib/role-config";
import { ChannelForm, type ChannelGroup } from "./channel-form";
import { RoleMappingForm } from "./role-mapping-form";

const PERM_HELP: Record<Perm, string> = {
  MANAGEMENT: "Everything, including the Admin pages: seasons, contracts, offers.",
  STAFF: "Runs matchday: lineup, tactics, set pieces, recruitment, events, news.",
  MEMBER: "In the club: Training and Availability, the fuller squad view.",
};

export const metadata = { title: "Discord roles & channels" };
export const dynamic = "force-dynamic";

export default async function AdminDiscord() {
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Discord channels</CardTitle>
          <CardDescription>
            Where the bot posts. The bot needs View Channel, Send Messages and Embed Links in each one.
            {!channelsSaved && " Not saved yet: nothing is posted until you pick channels."}
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
                { key: "events", label: "Events", help: "Fixtures and training, announced with RSVP buttons; match-day posts." },
                { key: "news", label: "News", help: "Articles, including the AI roundup, when published." },
                { key: "roster", label: "Roster", help: "Contract offers (when not DMed), departures, the season squad announcement." },
                { key: "recruitment", label: "Recruitment", help: "Prospect assessments. Staff only." },
                { key: "management", label: "Management", help: "Reminders: season ending, offers unanswered." },
                { key: "recognition", label: "Recognition", help: "Milestones and Player of the Month. Falls back to Events." },
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
            {!saved && " Not saved yet: showing the ROLE_IDS_* values from .env. Once saved here, those .env lines are ignored."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rolesError ? (
            <AdminCallout tone="warning" title="Couldn't load roles">{rolesError}</AdminCallout>
          ) : roles.length ? (
            <RoleMappingForm
              key={JSON.stringify(cfg)}
              roles={roles.map((r) => ({ id: r.id, name: r.name, color: r.color }))}
              perms={[...PERMS].reverse().map((p) => ({ key: p, label: PERM_LABELS[p], help: PERM_HELP[p] }))}
              clubRoles={(Object.keys(CLUB_ROLE_LABEL) as (keyof typeof CLUB_ROLE_LABEL)[]).map((k) => ({ key: k, label: CLUB_ROLE_LABEL[k] }))}
              statuses={(Object.keys(SQUAD_STATUS_LABEL) as (keyof typeof SQUAD_STATUS_LABEL)[]).map((k) => ({ key: k, label: SQUAD_STATUS_LABEL[k] }))}
              initial={cfg}
            />
          ) : (
            <AdminCallout title="Connect the bot to load roles">
              Set <code>DISCORD_BOT_TOKEN</code> and <code>DISCORD_GUILD_ID</code> in .env and restart the site; the server&apos;s roles will be listed here.
            </AdminCallout>
          )}
        </CardContent>
      </Card>
    </>
  );
}
