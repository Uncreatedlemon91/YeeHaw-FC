"use client";

import { useEffect, useState } from "react";

function label(ms: number, live: boolean): string {
  if (ms <= 0) return live ? "Live" : "Started";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `in ${d}d ${h}h`;
  if (h) return `in ${h}h ${m % 60}m`;
  return `in ${Math.max(m, 1)}m`;
}

/**
 * Relative time to an event: "in 2d 4h", "in 35m". At/after the start it
 * reads "Live" for `liveFor` ms (default 3h) and "Started" afterwards.
 * Rendered after mount so server and client markup never disagree; the full
 * date is the accessible label via `title`/aria-label.
 */
export function Countdown({
  to,
  liveFor = 3 * 3600_000,
  className,
}: {
  to: Date | string;
  liveFor?: number;
  className?: string;
}) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const full = new Date(to).toUTCString();
  const diff = now === null ? null : target - now;
  const text = diff === null ? "" : diff > 0 ? label(diff, true) : -diff < liveFor ? "Live" : "Started";
  return (
    <span aria-live="off" aria-label={text ? `${text} (${full})` : full} title={full} className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
