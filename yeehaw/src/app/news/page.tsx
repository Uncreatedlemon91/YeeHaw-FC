import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "News" };

export default async function Page() {
  return (
    <Container>
      <PageHeader eyebrow="Club" title="News" description="Match reports, transfers and the 48-hour roundup." />
      <Placeholder title="News">Staff-written articles and the AI roundup.</Placeholder>
    </Container>
  );
}
