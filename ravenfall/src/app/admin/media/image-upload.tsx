"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";

/** Screenshots go to /api/gallery: server actions cap bodies at 1 MB. */
export function ImageUpload({ events }: { events: { id: string; label: string }[] }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gallery", { method: "POST", body: new FormData(e.currentTarget) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: j.error ?? "That didn't work." });
      else {
        form.current?.reset();
        setMsg({ ok: true, text: "Added to the home page." });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Screenshot" htmlFor="file" help="PNG, JPG or WebP, up to 5 MB. Shown to everyone on the home page.">
        <input
          id="file"
          name="file"
          type="file"
          required
          accept="image/png,image/jpeg,image/webp"
          className="text-xs file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold"
        />
      </Field>
      <Field label="Caption (optional)" htmlFor="caption">
        <Input id="caption" name="caption" maxLength={200} placeholder="Bravo clearing the compound" />
      </Field>
      <Field label="Operation (optional)" htmlFor="img-event">
        <Select id="img-event" name="eventId" defaultValue="">
          <option value="">None</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" className="self-start" disabled={busy} aria-busy={busy || undefined}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} Upload
      </Button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-success-fg" : "text-sm text-destructive-fg"}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
