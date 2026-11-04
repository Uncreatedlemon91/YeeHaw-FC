"use client";

import type { Qualification } from "@prisma/client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AdminForm } from "@/components/admin-form";
import { QualBadge } from "@/components/qual-badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { CATEGORIES, categoryLabel } from "@/components/vault-category";
import { RANKS } from "@/config/unit";
import { BADGE_SHAPES, CATEGORY_COLOR, MAX_CODE, MAX_TASKS, SHAPE_LABEL } from "@/lib/qual-rules";
import { createQualification, updateQualification } from "@/app/vault/actions";

type Option = { id: string; title: string; category: string };

const legend = "mb-1 text-micro font-semibold uppercase tracking-label text-accent";

/** The assessment checklist: add, edit, reorder, remove. */
function TaskList({ tasks, setTasks, error }: { tasks: string[]; setTasks: (t: string[]) => void; error?: string }) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= tasks.length) return;
    const next = [...tasks];
    [next[i], next[j]] = [next[j], next[i]];
    setTasks(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2" aria-label="Assessment tasks">
        {tasks.map((t, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="typed w-6 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
            <Input
              name="task"
              value={t}
              maxLength={200}
              onChange={(e) => setTasks(tasks.map((x, k) => (k === i ? e.target.value : x)))}
              placeholder="Apply a tourniquet in under 30 seconds"
              aria-label={`Task ${i + 1}`}
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move task ${i + 1} up`}>
              <ArrowUp />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === tasks.length - 1} aria-label={`Move task ${i + 1} down`}>
              <ArrowDown />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => setTasks(tasks.filter((_, k) => k !== i))} aria-label={`Remove task ${i + 1}`}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ol>
      {!tasks.length && <p className="text-sm text-muted-foreground">No checklist: certifying is a single sign-off.</p>}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setTasks([...tasks, ""])} disabled={tasks.length >= MAX_TASKS}>
        <Plus /> Add task
      </Button>
      {error && <p className="text-xs text-destructive-fg">{error}</p>}
    </div>
  );
}

export function QualForm({ qual, prereqIds, options }: { qual?: Qualification; prereqIds: string[]; options: Option[] }) {
  const [title, setTitle] = useState(qual?.title ?? "");
  const [category, setCategory] = useState<string>(qual?.category ?? "GENERAL");
  const [shape, setShape] = useState(qual?.badgeShape ?? "TAB");
  const [ownColor, setOwnColor] = useState(!!qual?.badgeColor);
  const [color, setColor] = useState(qual?.badgeColor ?? CATEGORY_COLOR[qual?.category ?? "GENERAL"]);
  const [code, setCode] = useState(qual?.badgeCode ?? "");
  const [tasks, setTasks] = useState<string[]>(qual?.tasks ?? []);
  const [fe, setFe] = useState<Record<string, string> | undefined>();
  const action = async (prev: Parameters<typeof createQualification>[0], data: FormData) => {
    const r = await (qual ? updateQualification : createQualification)(prev, data);
    setFe(r?.fieldErrors);
    return r;
  };
  const preview = { title: title || "Qualification", category, badgeShape: shape, badgeColor: ownColor ? color : null, badgeCode: code };
  const others = options.filter((o) => o.id !== qual?.id);

  return (
    <AdminForm action={action} saveLabel={qual ? "Save qualification" : "Create and write the manual"}>
      {qual && <input type="hidden" name="id" value={qual.id} />}
      <fieldset className="flex flex-col gap-4">
        <legend className={legend}>Details</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Title" htmlFor="title" error={fe?.title}>
            <Input id="title" name="title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Combat Lifesaver" />
          </Field>
          <Field label="Category" htmlFor="category" error={fe?.category}>
            <Select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Summary" htmlFor="summary" help="One line shown beside the qualification." error={fe?.summary}>
          <Input id="summary" name="summary" maxLength={300} defaultValue={qual?.summary} />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t pt-5">
        <legend className={legend}>Badge</legend>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-background/40 p-4">
            <QualBadge q={preview} size={96} label={`${preview.title} badge preview`} />
            <div className="flex items-center gap-2">
              <QualBadge q={preview} size={20} />
              <QualBadge q={preview} size={20} expired />
            </div>
            <span className="text-micro text-muted-foreground">Held · expired</span>
          </div>
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <Field label="Shape" htmlFor="badgeShape">
              <Select id="badgeShape" name="badgeShape" value={shape} onChange={(e) => setShape(e.target.value)}>
                {BADGE_SHAPES.map((s) => (
                  <option key={s} value={s}>
                    {SHAPE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Letters (up to ${MAX_CODE})`} htmlFor="badgeCode" help="Blank: the title's initials." error={fe?.badgeCode}>
              <Input id="badgeCode" name="badgeCode" maxLength={MAX_CODE} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="uppercase" placeholder="CLS" />
            </Field>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="useCategoryColor" checked={!ownColor} onChange={(e) => setOwnColor(!e.target.checked)} className="size-4 accent-[var(--accent)]" />
                Use the {categoryLabel(category).toLowerCase()} colour
              </label>
              {ownColor && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="color" name="badgeColor" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border bg-transparent" aria-label="Badge colour" />
                  <span className="typed text-xs text-muted-foreground">{color}</span>
                </label>
              )}
              {fe?.badgeColor && <p className="text-xs text-destructive-fg">{fe.badgeColor}</p>}
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t pt-5">
        <legend className={legend}>Requirements</legend>
        <Field label="Minimum rank" htmlFor="minRank" error={fe?.minRank}>
          <Select id="minRank" name="minRank" defaultValue={qual?.minRank ?? ""} className="max-w-xs">
            <option value="">Any rank</option>
            {RANKS.map((r) => (
              <option key={r.abbr} value={r.abbr}>
                {r.name} ({r.grade})
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <div className="field-label mb-1.5">Prerequisites</div>
          <p className="mb-2 text-xs text-muted-foreground">Qualifications a member must hold (and be in date on) before they can be certified in this one.</p>
          {others.length ? (
            <div className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
              {others.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="prerequisite" value={o.id} defaultChecked={prereqIds.includes(o.id)} className="size-4 accent-[var(--accent)]" />
                  {o.title} <span className="text-xs text-muted-foreground">{categoryLabel(o.category)}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No other qualifications yet.</p>
          )}
          {fe?.prerequisites && <p className="mt-1 text-xs text-destructive-fg">{fe.prerequisites}</p>}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t pt-5">
        <legend className={legend}>Assessment</legend>
        <p className="text-xs text-muted-foreground">
          The tasks an assessor checks off on the member&apos;s file before certifying them. All must be passed. A course (an event set to train this qualification) certifies everyone the AAR marks as passed instead.
        </p>
        <TaskList tasks={tasks} setTasks={setTasks} error={fe?.tasks} />
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t pt-5">
        <legend className={legend}>Certification</legend>
        <Field label="Recertify after (days)" htmlFor="validDays" help="Blank: it never expires. Expired qualifications stop counting for billets and promotions." error={fe?.validDays}>
          <Input id="validDays" name="validDays" type="number" min={1} max={3650} defaultValue={qual?.validDays ?? ""} className="max-w-40" placeholder="365" />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="holdersCanCertify" defaultChecked={qual?.holdersCanCertify} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            Holders can certify others
            <span className="block text-xs text-muted-foreground">Members who hold it (in date) can assess and certify, not only instructors.</span>
          </span>
        </label>
      </fieldset>
    </AdminForm>
  );
}
