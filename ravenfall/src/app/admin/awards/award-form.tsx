"use client";

import type { Award } from "@prisma/client";
import { ArrowLeft, ArrowRight, FlipHorizontal2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AdminForm } from "@/components/admin-form";
import { Ribbon } from "@/components/ribbon";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  AWARD_KINDS,
  DEVICE_LABEL,
  DEVICES,
  KIND_LABEL,
  MAX_STRIPES,
  MAX_STRIPE_WIDTH,
  RULE_LABEL,
  RULE_TYPES,
  stripesOf,
  validateStripes,
  type AutoRule,
  type Stripe,
} from "@/lib/awards";
import { createAward, updateAward } from "./actions";

const START: Stripe[] = [
  { color: "#4f6b2f", width: 5 },
  { color: "#d4b483", width: 2 },
  { color: "#4f6b2f", width: 5 },
];

/** Add / remove / reorder stripes, with the ribbon drawn live beside the list. */
function StripeBuilder({ stripes, setStripes, device, repeatable, error }: { stripes: Stripe[]; setStripes: (s: Stripe[]) => void; device: string; repeatable: boolean; error?: string }) {
  const [previewCount, setPreviewCount] = useState(3);
  const set = (i: number, patch: Partial<Stripe>) => setStripes(stripes.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= stripes.length) return;
    const next = [...stripes];
    [next[i], next[j]] = [next[j], next[i]];
    setStripes(next);
  };
  const check = validateStripes(stripes);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-background/40 p-4">
        <div className="mx-auto w-full max-w-xs">
          <Ribbon stripes={check.ok ? check.stripes : stripesOf(null)} device={device as never} count={repeatable ? previewCount : 1} label="Ribbon preview" />
        </div>
        {repeatable && device !== "NONE" && (
          <label className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            Preview as earned
            <Input type="number" min={1} max={30} value={previewCount} onChange={(e) => setPreviewCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} className="h-8 w-16" aria-label="Times earned, for the preview" />
            times
          </label>
        )}
      </div>
      <ol className="flex flex-col gap-2" aria-label="Stripes, left to right">
        {stripes.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#000000"} onChange={(e) => set(i, { color: e.target.value })} aria-label={`Stripe ${i + 1} colour`} className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background/60 p-1" />
            <Input value={s.color} onChange={(e) => set(i, { color: e.target.value })} maxLength={7} aria-label={`Stripe ${i + 1} hex`} className="w-24 font-mono" />
            <Input type="number" min={1} max={MAX_STRIPE_WIDTH} value={s.width} onChange={(e) => set(i, { width: Number(e.target.value) })} aria-label={`Stripe ${i + 1} width`} className="w-20" />
            <span className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move stripe ${i + 1} left`}>
                <ArrowLeft />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === stripes.length - 1} aria-label={`Move stripe ${i + 1} right`}>
                <ArrowRight />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => setStripes(stripes.filter((_, k) => k !== i))} disabled={stripes.length === 1} aria-label={`Remove stripe ${i + 1}`}>
                <Trash2 />
              </Button>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={stripes.length >= MAX_STRIPES} onClick={() => setStripes([...stripes, { color: stripes.at(-1)?.color ?? "#808080", width: 2 }])}>
          <Plus /> Add stripe
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={stripes.length * 2 - 1 > MAX_STRIPES || stripes.length < 2} onClick={() => setStripes([...stripes, ...stripes.slice(0, -1).reverse()])} title="Repeat the stripes in reverse, so the ribbon is symmetrical">
          <FlipHorizontal2 /> Mirror
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Widths are relative units (1 to {MAX_STRIPE_WIDTH}); the ribbon is scaled to fit. Colours are #rrggbb.</p>
      {(error || !check.ok) && (
        <p role="alert" className="text-xs text-destructive-fg">
          {error ?? (check.ok ? "" : check.error)}
        </p>
      )}
    </div>
  );
}

function RuleFields({ rule, error }: { rule: AutoRule | null; error?: string }) {
  const [type, setType] = useState<string>(rule?.type ?? "");
  return (
    <div className="flex flex-col gap-3">
      <Field label="Awarded" htmlFor="ruleType" help="Nomination: squad leadership nominates and Command decides. Or pick a rule and members earn it automatically." error={error}>
        <Select id="ruleType" name="ruleType" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">By nomination</option>
          {RULE_TYPES.map((t) => (
            <option key={t} value={t}>
              Automatically: {RULE_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      {(type === "service_days" || type === "ops_attended") && (
        <Field label={type === "service_days" ? "Days since enlistment" : "Operations attended"} htmlFor="ruleThreshold">
          <Input id="ruleThreshold" name="ruleThreshold" type="number" min={1} defaultValue={rule && "threshold" in rule ? rule.threshold : ""} required className="max-w-40" />
        </Field>
      )}
      {type === "ops_attended" && (
        <Field label="Then every (optional)" htmlFor="ruleEvery" help="Earn it again for every this-many operations after the first. Needs Repeatable.">
          <Input id="ruleEvery" name="ruleEvery" type="number" min={1} defaultValue={rule?.type === "ops_attended" ? (rule.every ?? "") : ""} className="max-w-40" />
        </Field>
      )}
      {type === "campaign" && (
        <Field label="Campaign tag" htmlFor="ruleTag" help="Attending an operation tagged with this earns it.">
          <Input id="ruleTag" name="ruleTag" maxLength={60} defaultValue={rule?.type === "campaign" ? rule.tag : ""} required className="max-w-xs" />
        </Field>
      )}
      {type === "good_conduct" && (
        <Field label="Clean days" htmlFor="ruleDays" help="Active member with no disciplinary service-record entries in this window.">
          <Input id="ruleDays" name="ruleDays" type="number" min={1} defaultValue={rule?.type === "good_conduct" ? rule.days : ""} required className="max-w-40" />
        </Field>
      )}
    </div>
  );
}

/** Medal art goes straight to its own endpoint: it needs the award to exist first. */
function MedalUpload({ award, medalSrc }: { award: Pick<Award, "id" | "name">; medalSrc: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function send(method: "POST" | "DELETE", body?: FormData) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/awards/${award.id}/medal`, { method, body });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(j.error ?? "That didn't work.");
      else router.refresh();
    } catch {
      setMsg("Couldn't reach the server.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      {medalSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={medalSrc} alt={`${award.name} medal`} className="size-20 rounded-md border bg-background/40 object-contain" />
      ) : (
        <div className="grid size-20 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">No art</div>
      )}
      <div className="flex flex-col gap-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          aria-label="Medal image"
          className="text-xs file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.append("file", f);
            void send("POST", fd);
          }}
        />
        <p className="text-xs text-muted-foreground">PNG, JPG or WebP, up to 5 MB. Uploads straight away.</p>
        {medalSrc && (
          <Button type="button" variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => void send("DELETE")}>
            Remove art
          </Button>
        )}
        {msg && (
          <p role="alert" className="text-xs text-destructive-fg">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}

export function AwardForm({ award, rule, medalSrc, nextPrecedence }: { award?: Award; rule?: AutoRule | null; medalSrc?: string | null; nextPrecedence: number }) {
  const [stripes, setStripes] = useState<Stripe[]>(award ? stripesOf(award.ribbon) : START);
  const [repeatable, setRepeatable] = useState(award?.repeatable ?? false);
  const [device, setDevice] = useState<string>(award?.device ?? "NONE");
  const [fe, setFe] = useState<Record<string, string> | undefined>();
  // AdminForm owns the action state; wrap the action so field errors reach the fields.
  const action = async (prev: Parameters<typeof createAward>[0], data: FormData) => {
    const r = await (award ? updateAward : createAward)(prev, data);
    setFe(r?.fieldErrors);
    return r;
  };
  return (
    <div className="flex flex-col gap-8">
      <AdminForm action={action} saveLabel={award ? "Save award" : "Create award"}>
        {award && <input type="hidden" name="id" value={award.id} />}
        <input type="hidden" name="ribbon" value={JSON.stringify(stripes)} />
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-micro font-semibold uppercase tracking-label text-accent">Details</legend>
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <Field label="Name" htmlFor="name" error={fe?.name}>
              <Input id="name" name="name" required maxLength={80} defaultValue={award?.name} placeholder="Combat Valor Medal" />
            </Field>
            <Field label="Kind" htmlFor="kind" error={fe?.kind}>
              <Select id="kind" name="kind" defaultValue={award?.kind ?? "COMMENDATION"}>
                {AWARD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="description" help="One or two lines, shown in the catalog." error={fe?.description}>
            <Input id="description" name="description" maxLength={300} defaultValue={award?.description} />
          </Field>
          <Field label="Criteria" htmlFor="criteria" help="Markdown. What earns it." error={fe?.criteria}>
            <Textarea id="criteria" name="criteria" rows={6} maxLength={10000} defaultValue={award?.criteria} />
          </Field>
          <Field label="Precedence" htmlFor="precedence" help="Lower sits higher on the rack. The Awards list also has move up / down." error={fe?.precedence}>
            <Input id="precedence" name="precedence" type="number" min={1} required defaultValue={award?.precedence ?? nextPrecedence} className="max-w-40" />
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-4 border-t pt-5">
          <legend className="mb-1 text-micro font-semibold uppercase tracking-label text-accent">Ribbon</legend>
          <StripeBuilder stripes={stripes} setStripes={setStripes} device={device} repeatable={repeatable} error={fe?.ribbon} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="repeatable" checked={repeatable} onChange={(e) => setRepeatable(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Repeatable
            </label>
            <Field label="Device" htmlFor="device" help="How repeats show on the ribbon." error={fe?.device}>
              <Select id="device" name="device" value={device} onChange={(e) => setDevice(e.target.value)}>
                {DEVICES.map((d) => (
                  <option key={d} value={d}>
                    {DEVICE_LABEL[d]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4 border-t pt-5">
          <legend className="mb-1 text-micro font-semibold uppercase tracking-label text-accent">How it is awarded</legend>
          <RuleFields rule={rule ?? null} error={fe?.rule} />
        </fieldset>
      </AdminForm>

      <section className="flex flex-col gap-3 border-t pt-5">
        <h2 className="text-micro font-semibold uppercase tracking-label text-accent">Medal art</h2>
        {award ? <MedalUpload award={award} medalSrc={medalSrc ?? null} /> : <p className="text-sm text-muted-foreground">Create the award first, then upload its art here.</p>}
      </section>
    </div>
  );
}
