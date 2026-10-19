import Link from "next/link";
import { UNIT } from "@/config/unit";
import type { SessionUser } from "@/lib/auth";
import { hasPerm, topLabel, type Perm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { relDay } from "./ops-util";
import { SignInButton, SignOutButton } from "./auth-buttons";
import { Logo } from "./logo";
import { NavMenu } from "./nav-menu";
import { Button } from "./ui/button";

type Item = { href: string; label: string; perm?: Perm; guestOnly?: boolean };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard", perm: "OPERATOR" },
  { href: "/ops", label: "Operations", perm: "OPERATOR" },
  { href: "/roster", label: "Roster", perm: "OPERATOR" },
  { href: "/personnel", label: "S1 Desk", perm: "OPERATOR" },
  { href: "/vault", label: "Vault", perm: "OPERATOR" },
  { href: "/recruitment", label: "Recruitment", perm: "RECRUITER" },
  { href: "/admin", label: "Admin", perm: "ADMIN" },
  { href: "/apply", label: "Enlist", guestOnly: true },
];

export async function Nav({ user }: { user: SessionUser | null }) {
  // One cheap indexed query, signed-in operators only; a DB hiccup just hides the pill.
  const next = hasPerm(user?.perms, "OPERATOR")
    ? await prisma.event.findFirst({ where: { startTime: { gte: new Date() } }, orderBy: { startTime: "asc" }, select: { id: true, title: true, startTime: true } }).catch(() => null)
    : null;
  const pill = next && (
    <Link
      href={`/ops/${next.id}`}
      title={next.title}
      className="whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-micro font-semibold uppercase tracking-wider text-accent hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Next op · {relDay(next.startTime)}
    </Link>
  );
  const items = ITEMS.filter((i) =>
    i.guestOnly ? !hasPerm(user?.perms, "OPERATOR") : !i.perm || hasPerm(user?.perms, i.perm),
  );
  const links = items.map((i) =>
    i.guestOnly ? (
      <Button key={i.href} asChild variant="accent" size="sm" className="mx-1 my-1 md:my-0">
        <Link href={i.href}>{i.label}</Link>
      </Button>
    ) : (
      <Link
        key={i.href}
        href={i.href}
        className="whitespace-nowrap rounded px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {i.label}
      </Link>
    ),
  );

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 rounded text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
          <span className="font-display text-lg font-bold uppercase tracking-display text-foreground">
            {UNIT.siteName}
          </span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex">{links}</nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          {user ? (
            <>
              {pill}
              <div className="text-right leading-tight">
                <div className="text-sm font-semibold">{user.name}</div>
                <div className="text-micro uppercase tracking-wider text-muted-foreground">{topLabel(user.perms)}</div>
              </div>
              <SignOutButton />
            </>
          ) : (
            <SignInButton size="sm" />
          )}
        </div>
        {/* Mobile: a <details> disclosure (no-JS safe) that closes on navigation / outside click. */}
        <NavMenu>
          {links}
          {pill && <div className="px-3 py-2">{pill}</div>}
          <div className="mt-2 border-t pt-2">{user ? <SignOutButton className="w-full" /> : <SignInButton size="sm" className="w-full" />}</div>
        </NavMenu>
      </div>
    </header>
  );
}
