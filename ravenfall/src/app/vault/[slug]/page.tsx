import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";

export const metadata = { title: "Document" };

export default async function Doc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser("OPERATOR", `/vault/${slug}`);
  const doc = await prisma.qualification.findUnique({
    where: { slug },
    include: { updatedBy: true, holders: { include: { user: true }, orderBy: { awardedAt: "asc" } } },
  });
  if (!doc) notFound();
  const mine = doc.holders.find((h) => h.userId === me.id);

  return (
    <Container>
      <PageHeader
        eyebrow={`${doc.category} · v${doc.version}`}
        title={doc.title}
        description={doc.summary}
        actions={
          hasPerm(me.perms, "INSTRUCTOR") && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/vault/${doc.slug}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <Card>
          <CardContent className="py-6">
            {doc.content ? <Markdown>{doc.content}</Markdown> : <p className="text-sm text-muted-foreground">No content yet.</p>}
            <p className="mt-8 border-t pt-3 text-xs text-muted-foreground">
              Version {doc.version}, updated {fmtDate(doc.updatedAt)}
              {doc.updatedBy && ` by ${doc.updatedBy.callsign ?? doc.updatedBy.discordUsername}`}
            </p>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          {mine && (
            <Badge variant="success" className="justify-center py-1.5">
              You qualified {fmtDate(mine.awardedAt)}
            </Badge>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Qualified ({doc.holders.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {doc.holders.map((h) => (
                <Link key={h.id} href={`/roster/${h.userId}`} className="flex items-center gap-2 text-sm hover:text-accent">
                  <Avatar discordId={h.user.discordId} avatar={h.user.avatar} name={h.user.callsign ?? h.user.discordUsername} size={20} />
                  {h.user.rank && <span className="text-xs text-muted-foreground">{h.user.rank}</span>}
                  {h.user.callsign ?? h.user.discordUsername}
                </Link>
              ))}
              {!doc.holders.length && <p className="text-sm text-muted-foreground">Nobody yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}
