import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Set pieces" };

export default async function Page() {
  await requireUser("STAFF", "/staff/set-pieces");
  return (
    <Container>
      <PageHeader eyebrow="Staff" title="Set pieces" description="The routine book." />
      <Placeholder title="Set pieces">Corners, free kicks, penalties, throw-ins and kick-offs.</Placeholder>
    </Container>
  );
}
