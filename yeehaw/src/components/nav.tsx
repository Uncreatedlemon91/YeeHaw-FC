import Link from "next/link";
import { CLUB } from "@/config/club";
import { NAV, type NavItem } from "@/config/nav";
import type { SessionUser } from "@/lib/auth";
import { hasPerm, topLabel } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";
import { SignInButton, SignOutButton } from "./auth-buttons";
import { Logo } from "./logo";
import { NavDropdown } from "./nav-dropdown";
import { NavMenu } from "./nav-menu";

const linkClass =
  "whitespace-nowrap rounded px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export async function Nav({ user }: { user: SessionUser | null }) {
  // One cheap indexed query, members only; a DB hiccup just hides the pill.
  const next = hasPerm(user?.perms, "MEMBER")
    ? await prisma.event
        .findFirst({ where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, select: { id: true, title: true, startsAt: true } })
        .catch(() => null)
    : null;
  const pill = next && (
    <Link
      href={`/fixtures/${next.id}`}
      title={next.title}
      className="whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-micro font-semibold uppercase tracking-wider text-accent hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Next · {fmt(next.startsAt, "EEE HH:mm")}
    </Link>
  );
  const items: NavItem[] = NAV.filter((i) => !i.perm || hasPerm(user?.perms, i.perm))
    .map((i) => (i.children ? { ...i, children: i.children.filter((c) => !c.perm || hasPerm(user?.perms, c.perm)) } : i))
    // A menu with one entry left is just that link.
    .map((i) => (i.children?.length === 1 ? { href: i.children[0].href, label: i.children[0].label } : i))
    .filter((i) => !i.children || i.children.length > 0);

  const desktop = items.map((i) =>
    i.children ? (
      <NavDropdown key={i.href} label={i.label} pages={i.children} />
    ) : (
      <Link key={i.href} href={i.href} className={linkClass}>
        {i.label}
      </Link>
    ),
  );
  const mobile = items.map((i) =>
    i.children ? (
      <div key={i.href} role="group" aria-label={i.label} className="mt-1 flex flex-col border-t pt-1">
        <span className="px-3 py-1 font-mono text-micro font-semibold uppercase tracking-label text-muted-foreground">{i.label}</span>
        {i.children.map((c) => (
          <Link key={c.href} href={c.href} className={`${linkClass} pl-6`}>
            {c.label}
          </Link>
        ))}
      </div>
    ) : (
      <Link key={i.href} href={i.href} className={linkClass}>
        {i.label}
      </Link>
    ),
  );

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 rounded text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
          <span className="text-lg font-bold tracking-tight text-foreground">{CLUB.siteName}</span>
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-0.5 md:flex">{desktop}</nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          {user ? (
            <>
              {pill}
              <Link href={`/players/${user.slug}`} className="flex items-center gap-2 rounded text-right leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span>
                  <span className="block text-sm font-semibold">{user.name}</span>
                  <span className="block font-mono text-micro uppercase tracking-wider text-muted-foreground">{topLabel(user.perms)}</span>
                </span>
              </Link>
              <SignOutButton />
            </>
          ) : (
            <SignInButton size="sm" />
          )}
        </div>
        {/* Mobile: a <details> disclosure (no-JS safe) that closes on navigation / outside click. */}
        <NavMenu>
          {mobile}
          {pill && <div className="px-3 py-2">{pill}</div>}
          <div className="mt-2 border-t pt-2">{user ? <SignOutButton className="w-full" /> : <SignInButton size="sm" className="w-full" />}</div>
        </NavMenu>
      </div>
    </header>
  );
}
