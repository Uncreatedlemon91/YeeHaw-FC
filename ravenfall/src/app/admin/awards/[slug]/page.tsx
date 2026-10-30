import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { medalUrl, ruleOf } from "@/lib/awards";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AwardForm } from "../award-form";

export const metadata = { title: "Edit award" };
export const dynamic = "force-dynamic";

export default async function EditAward({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireUser("ADMIN", `/admin/awards/${slug}`);
  const award = await prisma.award.findUnique({ where: { slug } });
  if (!award) notFound();
  return (
    <Container size="narrow">
      <PageHeader
        eyebrow="Awards editor"
        title={`Edit: ${award.name}`}
        description={award.active ? undefined : "Retired: hidden from the catalog, still on the racks of those who hold it."}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/vault/${award.slug}`}>View in catalog</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="py-6">
          <AwardForm key={award.updatedAt.toISOString()} award={award} rule={ruleOf(award.autoRule)} medalSrc={medalUrl(award)} nextPrecedence={award.precedence} />
        </CardContent>
      </Card>
    </Container>
  );
}
