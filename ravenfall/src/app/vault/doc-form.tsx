"use client";

import type { Qualification } from "@prisma/client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { FormMessage, SubmitButton, type ActionState } from "@/components/action-form";
import { Markdown } from "@/components/markdown";
import { tabClass } from "@/components/tab-links";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CATEGORIES, categoryLabel } from "@/components/vault-category";
import { cn } from "@/lib/utils";

function Editor({ value, onChange, invalid, ...aria }: { value: string; onChange: (v: string) => void; invalid?: boolean } & React.AriaAttributes) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  return (
    <div className="flex flex-col">
      <div role="tablist" aria-label="Editor mode" className="flex gap-1 border-b">
        {(["write", "preview"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(tabClass(mode === m, "folder"), "-mb-px")}
          >
            {m}
          </button>
        ))}
      </div>
      {/* Stays mounted while previewing so its value is still submitted. */}
      <Textarea
        id="content"
        name="content"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("min-h-96 rounded-t-none font-mono text-xs leading-relaxed", mode === "preview" && "hidden")}
        placeholder="## Purpose&#10;&#10;Write the standard in Markdown…"
        {...aria}
      />
      {mode === "preview" && (
        <div className="min-h-96 rounded-b-md border border-t-0 bg-background/40 p-4 sm:p-6" aria-live="polite">
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  );
}

export function DocForm({
  action,
  doc,
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  doc?: Qualification;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [content, setContent] = useState(doc?.content ?? "");
  const [dirty, setDirty] = useState(false);
  const fe = state?.fieldErrors;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-6">
      {doc && <input type="hidden" name="id" value={doc.id} />}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-micro font-semibold uppercase tracking-label text-accent">Details</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Title" htmlFor="title" error={fe?.title}>
            <Input id="title" name="title" required maxLength={120} defaultValue={doc?.title} placeholder="Combat Lifesaver" />
          </Field>
          <Field label="Category" htmlFor="category" error={fe?.category}>
            <Select id="category" name="category" defaultValue={doc?.category ?? "GENERAL"}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Summary" htmlFor="summary" help="One line shown in the vault index." error={fe?.summary}>
          <Input id="summary" name="summary" maxLength={300} defaultValue={doc?.summary} />
        </Field>
      </fieldset>
      <fieldset className="flex flex-col gap-2 border-t pt-5">
        <legend className="mb-1 text-micro font-semibold uppercase tracking-label text-accent">Content</legend>
        <Field label="Markdown" htmlFor="content" help="Editing the content bumps the version number." error={fe?.content}>
          <Editor value={content} onChange={setContent} />
        </Field>
      </fieldset>
      <FormMessage state={state} />
      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t bg-card/95 px-5 py-3 backdrop-blur">
        <SubmitButton pendingText={doc ? "Saving…" : "Creating…"}>{doc ? "Save" : "Create"}</SubmitButton>
        <Button asChild variant="ghost">
          <Link href={doc ? `/vault/${doc.slug}` : "/vault"}>Cancel</Link>
        </Button>
        {dirty && (
          <span className="text-xs text-accent" role="status">
            Unsaved changes
          </span>
        )}
      </div>
    </form>
  );
}
