"use client";

import { useEffect, useState } from "react";

/** Live "n / max" counter bound to a textarea/input by id. */
export function CharCounter({ target, max }: { target: string; max: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = document.getElementById(target) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return;
    const on = () => setN(el.value.length);
    on();
    el.addEventListener("input", on);
    return () => el.removeEventListener("input", on);
  }, [target]);
  return (
    <span aria-hidden className={`ml-auto text-micro tabular-nums ${n >= max * 0.9 ? "text-warning" : "text-muted-foreground"}`}>
      {n} / {max}
    </span>
  );
}
