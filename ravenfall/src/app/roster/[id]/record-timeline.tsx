"use client";

import type { ServiceRecordType } from "@prisma/client";
import { ArrowRight, Lock, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { RankInsignia } from "@/components/insignia";
import { rankName } from "@/config/unit";
import { cn } from "@/lib/utils";
import { deleteRecord } from "../actions";
import { RECORD_DOT, RECORD_STYLE } from "./record-style";

export type RecordRow = {
  id: string;
  type: ServiceRecordType;
  title: string;
  description: string | null;
  date: string;
  /** ISO timestamp, for grouping by month. */
  iso: string;
  issuer: string | null;
  /** PROMOTION entries: rank abbreviations when they could be read from the entry. */
  from?: string | null;
  to?: string | null;
};

const RESTRICTED: ServiceRecordType[] = ["COUNSELING", "DISCIPLINARY"];
const PAGE = 20;

const monthOf = (iso: string) => {
  const d = new Date(iso);
  return { key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, year: d.getUTCFullYear(), month: d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" }) };
};

export function RecordTimeline({ records, canDelete }: { records: RecordRow[]; canDelete: boolean }) {
  const [filter, setFilter] = useState<ServiceRecordType | "ALL">("ALL");
  const [limit, setLimit] = useState(PAGE);
  const types = (Object.keys(RECORD_STYLE) as ServiceRecordType[]).filter((t) => records.some((r) => r.type === t));
  const shown = filter === "ALL" ? records : records.filter((r) => r.type === filter);
  const visible = shown.slice(0, limit);

  const groups = useMemo(() => {
    const out: { key: string; label: string; rows: RecordRow[] }[] = [];
    for (const r of visible) {
      const m = monthOf(r.iso);
      const last = out[out.length - 1];
      if (last?.key === m.key) last.rows.push(r);
      else out.push({ key: m.key, label: `${m.month} ${m.year}`, rows: [r] });
    }
    return out;
  }, [visible]);

  if (!records.length) return <p className="text-sm text-muted-foreground">No entries on file.</p>;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter entries">
        {(["ALL", ...types] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={filter === t}
            onClick={() => {
              setFilter(t);
              setLimit(PAGE);
            }}
            className={cn(
              "min-h-8 rounded-sm border px-2 py-1 text-micro font-semibold uppercase tracking-wider",
              filter === t ? "border-accent bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "ALL" ? "All" : RECORD_STYLE[t].label}{" "}
            <span className="opacity-60">{t === "ALL" ? records.length : records.filter((r) => r.type === t).length}</span>
          </button>
        ))}
      </div>

      {/* --dot: marker diameter; --rail: gutter that holds the marker and connector. */}
      <div className="flex flex-col [--dot:1.75rem] [--rail:2.75rem]">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h3 className="typed sticky top-[3.6rem] z-10 -mx-1 bg-jacket px-1 py-1.5 text-micro font-bold uppercase tracking-label text-muted-foreground">
              {g.label}
            </h3>
            <ol className="flex flex-col pt-2">
              {g.rows.map((r) => {
                const s = RECORD_STYLE[r.type];
                const Icon = s.icon;
                const promo = r.type === "PROMOTION";
                return (
                  <li key={r.id} className={cn("relative pb-5 pl-[var(--rail)]", RECORD_DOT[r.type])}>
                    {/* connector in the entry's colour */}
                    <span aria-hidden className="absolute bottom-0 left-[calc(var(--dot)/2-0.5px)] top-[var(--dot)] w-px bg-current opacity-30" />
                    <span className="absolute left-0 top-0 flex size-[var(--dot)] items-center justify-center rounded-full border-2 border-current bg-card">
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <div className="flex items-start justify-between gap-3 text-foreground">
                      <div className="min-w-0 flex-1">
                        <div className="typed text-micro uppercase text-muted-foreground">
                          {r.date} · {s.label}
                          {RESTRICTED.includes(r.type) && (
                            <span className="ml-2 inline-flex items-center gap-1 text-destructive-fg">
                              <Lock className="size-3" aria-hidden /> Restricted
                            </span>
                          )}
                        </div>
                        {promo ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-accent/40 bg-accent/10 p-3">
                            <div className={cn("flex items-center gap-2", !r.to && "hidden")} aria-label={r.from ? `Promoted from ${rankName(r.from)} to ${rankName(r.to)}` : undefined}>
                              {r.from && (
                                <>
                                  <RankInsignia rank={r.from} size={36} className="opacity-60" />
                                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                                </>
                              )}
                              {r.to && <RankInsignia rank={r.to} size={r.from ? 44 : 48} />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-display text-lg font-bold uppercase leading-tight">{r.title}</div>
                              {r.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.description}</p>}
                              {r.issuer && <p className="mt-0.5 text-xs text-muted-foreground">Issued by {r.issuer}</p>}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-semibold">{r.title}</div>
                            {r.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{r.description}</p>}
                            {r.issuer && <p className="mt-0.5 text-xs text-muted-foreground">Issued by {r.issuer}</p>}
                          </>
                        )}
                      </div>
                      {canDelete && (
                        <form action={deleteRecord}>
                          <input type="hidden" name="recordId" value={r.id} />
                          <ConfirmButton message="Delete this service record entry?" variant="ghost" size="icon" title="Delete entry" aria-label="Delete entry" className="text-muted-foreground">
                            <Trash2 />
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      {shown.length > visible.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="self-start rounded-md border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-accent hover:text-foreground"
        >
          Show more · {shown.length - visible.length} older
        </button>
      )}
    </div>
  );
}
