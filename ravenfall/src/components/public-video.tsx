"use client";

import { Play } from "lucide-react";
import { useState } from "react";

// Click-to-load: nothing from YouTube's player is fetched until the visitor
// asks for it. The poster is a plain themed panel (no third-party request).
export function VideoFacade({ id, title }: { id: string; title: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="tac-grid relative aspect-video overflow-hidden rounded-lg border bg-card">
      {on ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title={title}
          className="size-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setOn(true)}
          aria-label={`Play video: ${title}`}
          className="group flex size-full flex-col items-center justify-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-14 items-center justify-center rounded-full border-2 border-accent text-accent transition-transform group-hover:scale-105">
            <Play className="ml-0.5 size-6 fill-current" aria-hidden />
          </span>
          <span className="text-micro font-semibold uppercase tracking-label text-muted-foreground">{title}</span>
        </button>
      )}
    </div>
  );
}
