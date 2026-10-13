"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type FileTab = { id: string; label: string; badge?: number; content: React.ReactNode };

// The jacket's dividers. Every panel stays mounted (just hidden), so a
// half-filled form survives a tab switch; the open tab is mirrored into
// ?tab= so links and refreshes land on it.
export function FileTabs({ tabs, initial }: { tabs: FileTab[]; initial?: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.id === initial) ? initial! : tabs[0].id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function open(id: string) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = (i + step + tabs.length) % tabs.length;
    open(tabs[n].id);
    refs.current[n]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Personnel file sections" className="-mb-px flex gap-1 overflow-x-auto border-b px-1">
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => open(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors",
                on ? "jacket border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {!!t.badge && (
                <span className="rounded-sm bg-accent px-1.5 text-[10px] leading-4 text-accent-foreground">{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
          className="jacket rounded-b-lg rounded-tr-lg border p-4 sm:p-6"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
