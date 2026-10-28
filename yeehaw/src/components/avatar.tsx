"use client";

import { useState } from "react";
import { avatarUrl, cn } from "@/lib/utils";

function initials(name: string | null | undefined) {
  const words = (name ?? "").replace(/[^\p{L}\p{N}\s_-]/gu, "").split(/[\s_-]+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

// Plain <img>: Discord's CDN already serves sized PNGs, so next/image's
// optimiser would only add work for the droplet. Falls back to the member's
// initials (from `name`: gamertag or username) when there is no avatar or
// the image fails to load.
export function Avatar({
  discordId,
  avatar,
  size = 32,
  className,
  name,
}: {
  discordId: string;
  avatar: string | null | undefined;
  size?: number;
  className?: string;
  name?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || !avatar) {
    return (
      <span
        aria-hidden
        style={{ "--av": `${size}px`, fontSize: Math.max(9, Math.round(size * 0.4)) } as React.CSSProperties}
        className={cn(
          "inline-flex size-(--av) shrink-0 select-none items-center justify-center rounded-sm border bg-muted font-display font-bold uppercase leading-none text-muted-foreground",
          className,
        )}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl(discordId, avatar)}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      // The server-rendered <img> can fail before React hydrates, and then onError never fires.
      ref={(el) => {
        if (el?.complete && el.naturalWidth === 0) setFailed(true);
      }}
      className={cn("shrink-0 rounded-sm border bg-muted", className)}
    />
  );
}
