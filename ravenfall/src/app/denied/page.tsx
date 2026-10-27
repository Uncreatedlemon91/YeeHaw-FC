import { Lock } from "lucide-react";
import Link from "next/link";
import { PublicFrame } from "@/components/public-frame";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Restricted" };

export default async function Denied() {
  const user = await getSessionUser();
  return (
    <PublicFrame
      tab="Restricted"
      stamp="Denied"
      icon={
        <span className="flex size-14 items-center justify-center rounded-full border border-destructive/50 bg-destructive/10">
          <Lock className="size-6 text-destructive-fg" aria-hidden />
        </span>
      }
    >
      <h1 className="mt-5 text-3xl font-bold uppercase">Access denied</h1>
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
    </PublicFrame>
  );
}
