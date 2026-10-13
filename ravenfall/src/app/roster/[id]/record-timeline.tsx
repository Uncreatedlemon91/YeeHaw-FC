"use client";

import type { ServiceRecordType } from "@prisma/client";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { cn } from "@/lib/utils";
import { deleteRecord } from "../actions";
import { RECORD_STYLE } from "./record-style";

export type RecordRow = {
  id: string;
  type: ServiceRecordType;
  title: string;
  description: string | null;
  date: string;
  issuer: string | null;
};

const RESTRICTED: ServiceRecordType[] = ["COUNSELING", "DISCIPLINARY"];

export function RecordTimeline({ records, canDelete }: { records: RecordRow[]; canDelete: boolean }) {
  const [filter, setFilter] = useState<ServiceRecordType | "ALL">("ALL");
  const types = (Object.keys(RECORD_STYLE) as ServiceRecordType[]).filter((t) => records.some((r) => r.type === t));
  const shown = filter === "ALL" ? records : records.filter((r) => r.type === filter);

  if (!records.length) return <p className="text-sm text-muted-foreground">No entries on file.</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter entries">
        {(["ALL", ...types] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={filter === t}
            onClick={() => setFilter(t)}
            className={cn(
              "rounded-sm border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider",
              filter === t ? "border-accent bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "ALL" ? "All" : RECORD_STYLE[t].label}{" "}
            <span className="opacity-60">{t === "ALL" ? records.length : records.filter((r) => r.type === t).length}</span>
          </button>
        ))}
      </div>
      <ol className="relative flex flex-col gap-5 border-l pl-6">
        {shown.map((r) => {
          const s = RECORD_STYLE[r.type];
          const Icon = s.icon;
          return (
            <li key={r.id} className="relative">
              <span className="absolute -left-[35px] flex size-6 items-center justify-center rounded-full border bg-card">
                <Icon className={cn("size-3.5", s.color)} />
              </span>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="typed text-[11px] uppercase text-muted-foreground">
                    {r.date} · {s.label}
                    {RESTRICTED.includes(r.type) && <span className="ml-2 text-red-400">[Restricted]</span>}
                  </div>
                  <div className="font-semibold">{r.title}</div>
                  {r.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{r.description}</p>}
                  {r.issuer && <p className="mt-0.5 text-xs text-muted-foreground">Issued by {r.issuer}</p>}
                </div>
                {canDelete && (
                  <form action={deleteRecord}>
                    <input type="hidden" name="recordId" value={r.id} />
                    <ConfirmButton message="Delete this service record entry?" variant="ghost" size="icon" title="Delete entry" className="text-muted-foreground">
                      <Trash2 />
                    </ConfirmButton>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
