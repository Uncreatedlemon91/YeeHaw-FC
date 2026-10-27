"use client";

import { usePathname } from "next/navigation";
import { ABOUT_PAGES } from "@/config/about";
import { TabLinks } from "./tab-links";

/** The About section's sub-nav, driven by ABOUT_PAGES. */
export function AboutTabs() {
  const path = usePathname();
  const items = [{ href: "/about", label: "Overview" }, ...ABOUT_PAGES].map((p) => ({ href: p.href, label: p.label, active: path === p.href }));
  return <TabLinks items={items} label="About" />;
}
