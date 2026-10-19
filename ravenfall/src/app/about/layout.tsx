import { AboutTabs } from "@/components/about-tabs";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { UNIT } from "@/config/unit";

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container>
      <PageHeader
        eyebrow="About"
        title={`Inside ${UNIT.name}`}
        description="What the unit looks like from the inside: how rank works, who fills which billet, and what training gets you there."
        className="mb-4"
      />
      <AboutTabs />
      {children}
    </Container>
  );
}
