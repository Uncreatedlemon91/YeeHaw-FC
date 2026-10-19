"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TabStrip, tabClass } from "@/components/tab-links";

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
    <div className="min-w-0">
      <TabStrip role="tablist" aria-label="Personnel file sections" activeKey={active} className="-mb-px border-b px-1">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            onClick={() => open(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={tabClass(t.id === active, "folder")}
          >
            {t.label}
            {!!t.badge && <Badge variant="accent">{t.badge}</Badge>}
          </button>
        ))}
      </TabStrip>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
          className="jacket min-w-0 overflow-x-hidden rounded-b-lg rounded-tr-lg border p-4 sm:p-6"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
