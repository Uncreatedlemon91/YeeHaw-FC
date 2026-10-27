import { AdminTabs } from "@/components/admin-tabs";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";

// Every Admin page is management only. Server actions re-check on their own
// (assertPerm): this guard keeps the pages out of sight, not the data safe.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireUser("MANAGEMENT", "/admin");
  return (
    <Container>
      <PageHeader eyebrow="Management" title="Admin" description="Seasons and contracts, Discord wiring and the club's profile." />
      <AdminTabs />
      {children}
    </Container>
  );
}
