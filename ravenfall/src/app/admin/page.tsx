import { CheckCircle2, XCircle } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { explain, listRoles, type Role } from "@/lib/discord";
import { env } from "@/lib/env";
import { PERM_LABELS, type Perm } from "@/lib/permissions";
import { postRecruitmentMessage, registerCommands } from "./actions";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function Admin() {
  await requireUser("ADMIN", "/admin");

  let roles: Role[] = [];
  let rolesError: string | null = null;
  if (env.botToken && env.guildId) {
    try {
      roles = (await listRoles()).filter((r) => !r.managed && r.name !== "@everyone").sort((a, b) => b.position - a.position);
    } catch (e) {
      rolesError = explain(e);
    }
  }
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? `unknown (${id})`;

  const checks: [string, boolean, string][] = [
    ["Discord OAuth", !!(env.clientId && process.env.DISCORD_CLIENT_SECRET), "DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET"],
    ["Bot token", !!env.botToken, "DISCORD_BOT_TOKEN"],
    ["Guild", !!env.guildId, "DISCORD_GUILD_ID"],
    ["Interactions endpoint", !!env.publicKey, "DISCORD_PUBLIC_KEY"],
    ["Recruitment board", !!env.boardChannelId, "RECRUITMENT_BOARD_CHANNEL_ID"],
    ["Welcome channel", !!env.welcomeChannelId, "WELCOME_CHANNEL_ID"],
    ["Recruit role", !!env.recruitRoleId, "ROLE_ID_RECRUIT"],
    ["Candidate role", !!env.candidateRoleId, "ROLE_ID_CANDIDATE"],
    ["Ops announcements (optional)", !!env.opsChannelId, "OPS_ANNOUNCE_CHANNEL_ID"],
  ];

  return (
    <Container className="max-w-5xl">
      <PageHeader eyebrow="Command" title="Admin" description="Discord integration status and one-off setup actions." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Set in the server&apos;s .env; restart the site after changing it.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {checks.map(([label, ok, key]) => (
              <div key={key} className="flex items-center justify-between gap-3 text-sm">
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
            <CardTitle>Permission mapping</CardTitle>
            <CardDescription>Discord roles granting each site permission.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {(Object.keys(PERM_LABELS) as Perm[]).map((p) => (
              <div key={p}>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {PERM_LABELS[p]} <code className="ml-1 font-normal normal-case">ROLE_IDS_{p}</code>
                </div>
                <div>{env.roleIds[p].length ? env.roleIds[p].map(roleName).join(", ") : <span className="text-red-400">none set</span>}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recruitment message</CardTitle>
            <CardDescription>Posts an embed with a persistent Enlist Now button to the welcome channel.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={postRecruitmentMessage}>
              <SubmitButton variant="accent" className="self-start" disabled={!env.welcomeChannelId}>
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
          <CardTitle>Server roles</CardTitle>
          <CardDescription>Copy IDs from here into the ROLE_* settings.</CardDescription>
        </CardHeader>
        {rolesError ? (
          <CardContent className="text-sm text-red-300">{rolesError}</CardContent>
        ) : roles.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Role</TH>
                <TH>ID</TH>
              </TR>
            </THead>
            <TBody>
              {roles.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: r.color ? `#${r.color.toString(16).padStart(6, "0")}` : "#888" }} />
                    {r.name}
                  </TD>
                  <TD>
                    <code className="text-xs">{r.id}</code>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted-foreground">Set the bot token and guild ID to list roles.</CardContent>
        )}
      </Card>
    </Container>
  );
}
