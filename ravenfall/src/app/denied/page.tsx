import Link from "next/link";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Restricted" };

export default async function Denied() {
  const user = await getSessionUser();
  return (
    <Container className="max-w-lg py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-label text-destructive-fg">Restricted</p>
      <h1 className="mt-2 text-3xl font-bold uppercase">Access denied</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        {user?.inGuild === false
          ? "You aren't in the unit's Discord server, so the site can't see any of your roles. Join the server, then sign in again."
          : "Your Discord roles don't grant access to this page. If you were recently promoted, it can take up to five minutes to apply."}
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
        {!user?.perms.length && (
          <Button asChild variant="accent">
            <Link href="/apply">Enlist</Link>
          </Button>
        )}
      </div>
    </Container>
  );
}
