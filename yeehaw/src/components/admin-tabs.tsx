"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabClass, TabStrip } from "@/components/tab-links";

const TABS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/seasons", label: "Seasons & contracts" },
  { href: "/admin/discord", label: "Discord roles & channels" },
  { href: "/admin/club", label: "Club profile" },
];

/** The Admin section's tab strip. Client-side only to know the current path. */
export function AdminTabs() {
  const path = usePathname();
  const active = (t: (typeof TABS)[number]) => (t.exact ? path === t.href : path.startsWith(t.href));
  return (
    <nav aria-label="Admin sections" className="mb-6">
      <TabStrip activeKey={TABS.find(active)?.href}>
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={active(t) ? "page" : undefined} className={tabClass(active(t))}>
            {t.label}
          </Link>
        ))}
      </TabStrip>
    </nav>
  );
}
