import type { Qualification } from "@prisma/client";
import { ActionForm, type ActionState, SubmitButton } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

export const CATEGORIES = ["WEAPONS", "LEADERSHIP", "MEDICAL", "PILOT", "GENERAL"] as const;

export function DocForm({
  action,
  doc,
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  doc?: Qualification;
}) {
  return (
    <ActionForm action={action}>
      {doc && <input type="hidden" name="id" value={doc.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" required maxLength={120} defaultValue={doc?.title} placeholder="Combat Lifesaver" />
        </Field>
        <Field label="Category" htmlFor="category">
          <Select id="category" name="category" defaultValue={doc?.category ?? "GENERAL"}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Summary" htmlFor="summary" help="One line shown in the vault index.">
        <Input id="summary" name="summary" maxLength={300} defaultValue={doc?.summary} />
      </Field>
      <Field label="Content (Markdown)" htmlFor="content" help="Editing the content bumps the version number.">
        <Textarea id="content" name="content" className="min-h-96 font-mono text-xs" defaultValue={doc?.content} />
      </Field>
      <SubmitButton className="self-start">{doc ? "Save" : "Create"}</SubmitButton>
    </ActionForm>
  );
}
