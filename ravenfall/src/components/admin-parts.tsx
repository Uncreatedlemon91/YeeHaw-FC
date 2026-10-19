import { CheckCircle2, CircleDashed, Info, TriangleAlert } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Compact "nothing to show yet, here's the next step" strip. */
export function AdminCallout({ title, children, tone = "info" }: { title: string; children: React.ReactNode; tone?: "info" | "warning" }) {
  const Icon = tone === "warning" ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm",
        tone === "warning" ? "border-warning/40 bg-warning/10" : "border-info/40 bg-info/10",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone === "warning" ? "text-warning" : "text-info")} />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export type Check = { label: string; ok: boolean; env: string; optional?: boolean; hint: string };

/** One setting: label above its env name on small screens, side by side on wider ones. */
function CheckRow({ c }: { c: Check }) {
  const Icon = c.ok ? CheckCircle2 : c.optional ? CircleDashed : TriangleAlert;
  const tone = c.ok ? "text-success-fg" : c.optional ? "text-muted-foreground" : "text-warning";
  return (
    <li className="flex items-start gap-2.5 py-2 text-sm">
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="font-medium">
            {c.label}
            <span className="sr-only">{c.ok ? ": configured" : c.optional ? ": optional, not set" : ": needs attention"}</span>
          </span>
          <code className="break-all text-xs text-muted-foreground sm:text-right">{c.env}</code>
        </div>
        {!c.ok && <p className="mt-0.5 text-xs text-muted-foreground">{c.hint}</p>}
      </div>
    </li>
  );
}

export function ChecksCard({ checks }: { checks: Check[] }) {
  const todo = checks.filter((c) => !c.ok && !c.optional);
  const optional = checks.filter((c) => !c.ok && c.optional);
  const done = checks.filter((c) => c.ok);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
        <CardDescription>
          {todo.length ? (
            <>
              <strong className="text-warning">{todo.length} need{todo.length === 1 ? "s" : ""} attention</strong> · {done.length} configured
            </>
          ) : (
            <strong className="text-success-fg">Everything required is configured</strong>
          )}
          {optional.length > 0 && ` · ${optional.length} optional not set`}. Credentials live in the server&apos;s .env (restart after changing it).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {todo.length > 0 && (
          <section aria-label="Needs attention">
            <h3 className="mb-1 text-micro font-semibold uppercase tracking-label text-warning">Needs attention</h3>
            <ul className="divide-y rounded-md border border-warning/30 bg-warning/5 px-3">
              {todo.map((c) => (
                <CheckRow key={c.label} c={c} />
              ))}
            </ul>
          </section>
        )}
        {optional.length > 0 && (
          <section aria-label="Optional">
            <h3 className="mb-1 text-micro font-semibold uppercase tracking-label text-muted-foreground">Optional</h3>
            <ul className="divide-y">
              {optional.map((c) => (
                <CheckRow key={c.label} c={c} />
              ))}
            </ul>
          </section>
        )}
        {done.length > 0 && (
          <section aria-label="Configured">
            <h3 className="mb-1 text-micro font-semibold uppercase tracking-label text-success-fg">Configured</h3>
            <ul className="divide-y">
              {done.map((c) => (
                <CheckRow key={c.label} c={c} />
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

/** A one-off action: shows pending + result, and a readable reason when it can't run. */
export function ActionCard({
  title,
  description,
  action,
  label,
  pendingText,
  disabledReason,
  variant = "secondary",
}: {
  title: string;
  description: React.ReactNode;
  action: React.ComponentProps<typeof ActionForm>["action"];
  label: string;
  pendingText: string;
  disabledReason?: string;
  variant?: "default" | "secondary";
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={action}>
          <SubmitButton
            variant={variant}
            className="self-start disabled:border disabled:border-dashed disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-100"
            disabled={!!disabledReason}
            pendingText={pendingText}
          >
            {label}
          </SubmitButton>
          {disabledReason && <p className="-mt-2 text-xs text-muted-foreground">{disabledReason}</p>}
        </ActionForm>
      </CardContent>
    </Card>
  );
}
