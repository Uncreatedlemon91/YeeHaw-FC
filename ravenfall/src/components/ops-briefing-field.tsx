"use client";

import { Eye, FilePlus2, Pencil } from "lucide-react";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";

const SMEAC = `## Situation
- Enemy forces:
- Friendly forces:
- Terrain / weather:

## Mission
Who, what, when, where, why.

## Execution
- Commander's intent:
- Concept of operations:
- Tasks per element:

## Sustainment
- Kit / loadout:
- Medevac:

## Command & Signal
- Net / frequencies:
- Chain of command:
`;

/** Briefing textarea with an SMEAC template insert and a Markdown preview toggle. */
export function BriefingField({ defaultValue }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [preview, setPreview] = useState(false);
  return (
    <Field label="Briefing (Markdown)" htmlFor="description" help="Situation, mission, execution, kit — whatever members need beforehand.">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (!value.trim() || confirm("Replace the current briefing with the SMEAC template?")) setValue(SMEAC);
            setPreview(false);
          }}
        >
          <FilePlus2 /> Insert SMEAC template
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-pressed={preview} onClick={() => setPreview((p) => !p)}>
          {preview ? <Pencil /> : <Eye />} {preview ? "Edit" : "Preview"}
        </Button>
      </div>
      {/* Always mounted so the value posts even while previewing. */}
      <Textarea
        id="description"
        name="description"
        className={preview ? "hidden" : "min-h-56 font-mono text-xs"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {preview && (
        <div className="min-h-56 rounded-md border bg-card/50 p-4">
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
        </div>
      )}
    </Field>
  );
}
