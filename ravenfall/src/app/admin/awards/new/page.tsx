import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AwardForm } from "../award-form";

export const metadata = { title: "New award" };

export default async function NewAward() {
  await requireUser("ADMIN", "/admin/awards/new");
  const last = await prisma.award.aggregate({ _max: { precedence: true } });
  return (
    <Container size="narrow">
      <PageHeader eyebrow="Awards editor" title="New award" />
      <Card>
        <CardContent className="py-6">
          <AwardForm nextPrecedence={(last._max.precedence ?? 0) + 10} />
        </CardContent>
      </Card>
    </Container>
  );
}
