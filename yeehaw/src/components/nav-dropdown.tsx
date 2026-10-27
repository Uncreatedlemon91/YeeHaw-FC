"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const TRIGGER =
  "inline-flex items-center gap-1 whitespace-nowrap rounded px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type NavLink = { href: string; label: string };

/**
 * Desktop nav dropdown (Club, Staff, Admin): a disclosure button (click,
 * Enter, Space, ArrowDown), hover also opens it. Active when the path is
 * under any of its items.
 */
export function NavDropdown({ label, pages }: { label: string; pages: readonly NavLink[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const byClick = useRef(true);
  const path = usePathname();
  const id = useId();
  const active = pages.some((p) => path === p.href || path.startsWith(p.href + "/"));

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = useCallback(() => Array.from(wrap.current?.querySelectorAll<HTMLElement>("a[data-item]") ?? []), []);
  const move = (e: React.KeyboardEvent, dir: 1 | -1) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    list[(i + dir + list.length) % list.length]?.focus();
    e.preventDefault();
  };

  return (
    <div
      ref={wrap}
      className="relative"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse" && !open) {
          byClick.current = false;
          setOpen(true);
        }
      }}
      onPointerLeave={(e) => e.pointerType === "mouse" && !byClick.current && setOpen(false)}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null) && e.relatedTarget) setOpen(false);
      }}
    >
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          // Hover may have opened it already; a click then pins it open.
          const close = open && byClick.current;
          byClick.current = !close;
          setOpen(!close);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            byClick.current = true;
            setOpen(true);
            requestAnimationFrame(() => items()[0]?.focus());
          }
        }}
        className={cn(TRIGGER, active ? "text-foreground" : "text-muted-foreground")}
      >
        {label}
        <ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      <ul
        id={id}
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") move(e, 1);
          else if (e.key === "ArrowUp") move(e, -1);
        }}
        className="absolute left-0 top-full z-50 min-w-44 rounded-md border bg-card p-1 shadow-lg"
      >
        {pages.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              data-item
              aria-current={path === p.href ? "page" : undefined}
              className={cn(
                "block whitespace-nowrap rounded px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                path === p.href ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {p.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
