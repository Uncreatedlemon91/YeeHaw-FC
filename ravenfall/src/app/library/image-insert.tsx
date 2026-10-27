"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Uploads an image and drops `![alt](url)` into the Markdown textarea at the
// cursor. The textarea is uncontrolled, so it's edited through the DOM.
export function ImageInsert({ textareaId }: { textareaId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function upload(file: File) {
    setError(undefined);
    if (file.size > 5 * 1024 * 1024) return setError("Images can be up to 5 MB.");
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/library/images", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) return setError(json.error ?? "Upload failed.");
      const area = document.getElementById(textareaId) as HTMLTextAreaElement | null;
      if (!area) return;
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[[\]()]/g, "") || "image";
      const md = `![${alt}](${json.url})`;
      const start = area.selectionStart ?? area.value.length;
      const end = area.selectionEnd ?? start;
      area.setRangeText(md, start, end, "end");
      area.focus();
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        <ImagePlus /> {busy ? "Uploading…" : "Insert image"}
      </Button>
      <span className="text-xs text-muted-foreground">PNG, JPG or WebP, up to 5 MB. Inserted at the cursor.</span>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
