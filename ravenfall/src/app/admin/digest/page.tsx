import { Send } from "lucide-react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getChannelConfig } from "@/lib/channel-config";
import { buildDigest, digestMessage, lastDigest } from "@/lib/digest";
import { fmt } from "@/lib/time";
import { postDigestNow } from "./actions";

export const metadata = { title: "Weekly digest" };
export const dynamic = "force-dynamic";

/** Discord markdown, just enough for a preview: **bold**, [links](…), <@id> and <t:…> tokens. */
function Line({ text, names }: { text: string; names: Map<string, string> }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|<@\d+>|<t:\d+:\w>)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) return <span key={i} className="text-accent">{link[1]}</span>;
        const at = p.match(/^<@(\d+)>$/);
        if (at) return <span key={i} className="rounded bg-accent/15 px-1 text-accent">@{names.get(at[1]) ?? "member"}</span>;
        const t = p.match(/^<t:(\d+):\w>$/);
        if (t) return <span key={i}>{fmt(new Date(Number(t[1]) * 1000), "EEE d MMM HH:mm")}</span>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export default async function DigestPage() {
  await requireUser("ADMIN", "/admin/digest");
  const [d, { digest: channel }, last] = await Promise.all([buildDigest(), getChannelConfig(), lastDigest()]);
  const embed = digestMessage(d).embeds[0];
  const names = new Map(
    [...d.promotions.map((x) => x.user), ...d.awards.map((x) => x.user), ...d.quals.map((x) => x.user), ...d.enlisted, ...d.top.map((x) => x.user)].map((u) => [u.discordId, u.callsign ?? u.discordUsername]),
  );
  return (
    <Container size="narrow">
      <PageHeader
        eyebrow="Command"
        title="Weekly digest"
        description="Posted to the digest channel every Monday at 18:00 unit time, once per week. This is what it would say right now."
        actions={
          <Link href="/admin" className="text-sm text-accent underline-offset-4 hover:underline">
            Admin
          </Link>
        }
      />
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 py-5 text-sm">
          <p>
            {channel ? "Goes to the digest channel set on the Admin page." : <span className="text-warning">No digest channel set: pick one under Discord channels on the Admin page.</span>}{" "}
            {last ? `Last posted ${fmt(new Date(last.postedAt))} (${last.week}).` : "Not posted yet."}
          </p>
          {channel && (
            <ActionForm action={postDigestNow} className="gap-2">
              <SubmitButton size="sm" className="self-start" pendingText="Posting…">
                <Send /> Post now
              </SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-success-fg">
        <CardHeader>
          <CardTitle>{embed.title}</CardTitle>
          <p className="text-sm">
            <Line text={embed.description} names={names} />
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {embed.fields.map((f) => (
            <div key={f.name}>
              <div className="field-label mb-1">{f.name}</div>
              <ul className="flex flex-col gap-0.5 text-sm">
                {f.value.split("\n").map((l, i) => (
                  <li key={i}>
                    <Line text={l} names={names} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-micro text-muted-foreground">{embed.footer.text}</p>
        </CardContent>
      </Card>
    </Container>
  );
}
