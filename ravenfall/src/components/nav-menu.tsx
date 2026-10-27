"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "./ui/button";

// Mobile disclosure menu. Still a <details> (works before hydration), plus:
// closes on navigation, on Escape and on a click outside.
export function NavMenu({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path]);

  useEffect(() => {
    const el = ref.current;
    const close = () => {
      if (el) el.open = false;
    };
    const onDown = (e: Event) => {
      if (el?.open && !el.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el?.open) {
        close();
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className="group relative ml-auto md:hidden">
      <summary
        aria-label="Menu"
        className="list-none rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <Button asChild variant="ghost" size="icon">
          <span>
            <Menu />
          </span>
        </Button>
      </summary>
      <div className="absolute right-0 mt-2 flex w-56 flex-col rounded-md border bg-card p-2 shadow-lg">{children}</div>
    </details>
  );
}
