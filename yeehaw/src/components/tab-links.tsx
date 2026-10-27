"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type TabVariant = "pill" | "folder";

/**
 * Class for one tab. `pill`: flat segmented tabs (fixtures, recruitment).
 * `folder`: divider tabs that sit on a panel (the player hub).
 */
export function tabClass(active: boolean, variant: TabVariant = "pill") {
  const base =
    "flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap text-xs font-semibold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return variant === "folder"
    ? cn(
        base,
        "min-h-10 rounded-t-md border border-b-0 px-4 py-2 tracking-label sm:min-h-0",
        active ? "folder-tab text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )
    : cn(
        base,
        "min-h-10 rounded px-3 py-1.5 tracking-wider sm:min-h-0",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      );
}

/**
 * Horizontally scrolling strip: scroll-snap, a fade on whichever edge has
 * more content, and the active tab ([aria-current] / [aria-selected=true])
 * scrolled into view when `activeKey` changes. Used by TabLinks and FileTabs.
 */
export function TabStrip({
  activeKey,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { activeKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = el.querySelector<HTMLElement>('[aria-current="page"],[aria-selected="true"]');
    // Scroll only the strip, never the page.
    if (on) el.scrollLeft = Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeKey, measure]);

  const fade = `linear-gradient(to right, ${edges.left ? "transparent, #000 1.5rem" : "#000, #000"}, ${edges.right ? "#000 calc(100% - 1.5rem), transparent" : "#000, #000"})`;
  return (
    <div
      ref={ref}
      onScroll={measure}
      style={{ maskImage: fade, WebkitMaskImage: fade }}
      className={cn("flex snap-x gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export type TabLinkItem = {
  href: string;
  label: React.ReactNode;
  active: boolean;
  /** Optional leading icon element, e.g. `<List className="size-3.5" />`. */
  icon?: React.ReactNode;
  /** Optional trailing count. */
  count?: number;
};

/** Link tabs for server-driven views (?view=, ?status=). `label` names the nav landmark. */
export function TabLinks({
  items,
  label,
  variant = "pill",
  className,
}: {
  items: TabLinkItem[];
  label: string;
  variant?: TabVariant;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn(variant === "folder" ? "mb-5 border-b px-1" : "mb-4", className)}>
      <TabStrip activeKey={items.find((i) => i.active)?.href} className={variant === "folder" ? "-mb-px" : undefined}>
        {items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={i.active ? "page" : undefined} className={tabClass(i.active, variant)}>
            {i.icon}
            {i.label}
            {i.count !== undefined && <span className="text-muted-foreground">{i.count}</span>}
          </Link>
        ))}
      </TabStrip>
    </nav>
  );
}
