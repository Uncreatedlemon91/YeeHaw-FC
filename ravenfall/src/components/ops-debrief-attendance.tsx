"use client";

import { CheckCheck } from "lucide-react";
import { useState } from "react";
import { RankInsignia } from "@/components/insignia";
import { ChipRadio } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type DebriefRow = { id: string; name: string; rank: string | null; rsvp: string | null; initial: string };

const CHOICES = [
  ["ATTENDING", "Attended"],
  ["EXCUSED", "Excused"],
  ["ABSENT", "Absent"],
  ["NOSHOW", "No-show"],
] as const;

/** Attendance marks as segmented chips; posts `att:<userId>` exactly as the old selects did. */
export function DebriefAttendance({ rows }: { rows: DebriefRow[] }) {
  const [marks, setMarks] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.initial])));
  const rsvpd = rows.filter((r) => r.rsvp === "ATTENDING");
  const attended = Object.values(marks).filter((v) => v === "ATTENDING").length;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div>
          <CardTitle>Attendance</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Pre-filled from RSVPs. Set what actually happened; choose &ldquo;—&rdquo; to keep a member off the record.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!rsvpd.length}
            onClick={() => setMarks((m) => ({ ...m, ...Object.fromEntries(rsvpd.map((r) => [r.id, "ATTENDING"])) }))}
          >
            <CheckCheck /> Mark all RSVP&apos;d as Attended
          </Button>
          <span className="typed text-xs text-muted-foreground" aria-live="polite">
            {attended} attended · {rows.length} listed
          </span>
        </div>
      </CardHeader>
      <CardContent className="py-0">
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="py-3">
              <div className="mb-2 flex min-w-0 items-center gap-2">
                <RankInsignia rank={r.rank} size={22} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate font-semibold">{r.name}</div>
                  <div className="text-micro uppercase tracking-wider text-muted-foreground">RSVP: {r.rsvp ?? "none"}</div>
                </div>
              </div>
              <div role="radiogroup" aria-label={`Final attendance for ${r.name}`} className="grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap">
                <ChipRadio
                  name={`att:${r.id}`}
                  value=""
                  checked={!marks[r.id]}
                  onChange={() => setMarks((m) => ({ ...m, [r.id]: "" }))}
                  chipClassName="px-1 py-2 text-center sm:px-3"
                  aria-label="Leave off the record"
                >
                  —
                </ChipRadio>
                {CHOICES.map(([v, label]) => (
                  <ChipRadio
                    key={v}
                    name={`att:${r.id}`}
                    value={v}
                    checked={marks[r.id] === v}
                    onChange={() => setMarks((m) => ({ ...m, [r.id]: v }))}
                    tone={v === "EXCUSED" ? "info" : "success"}
                    chipClassName="px-1 py-2 text-center sm:px-3"
                  >
                    {label}
                  </ChipRadio>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
