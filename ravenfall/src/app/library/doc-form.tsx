import type { LibraryDocument, LibraryFolder, Qualification } from "@prisma/client";
import { ActionForm, type ActionState, SubmitButton } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { RANKS, SQUADS, UNIT_ROLES } from "@/config/unit";
import { canRead, folderPathName, type Viewer } from "@/lib/library";
import { ClearanceSelect } from "./folder-forms";
import { ImageInsert } from "./image-insert";

export function DocForm({
  action,
  viewer,
  folders,
  doc,
  folderId,
  qualifications,
  linked,
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  viewer: Viewer;
  folders: LibraryFolder[];
  doc?: LibraryDocument;
  /** Preselected folder for a new document. */
  folderId?: string | null;
  /** Every vault qualification, and the ids this document links to. */
  qualifications: Pick<Qualification, "id" | "title" | "category">[];
  linked?: string[];
}) {
  const selected = doc ? doc.folderId : (folderId ?? null);
  const folder = folders.find((f) => f.id === selected);
  return (
    <ActionForm action={action}>
      {doc && <input type="hidden" name="id" value={doc.id} />}
      <Field label="Title" htmlFor="title">
        <Input id="title" name="title" required maxLength={120} defaultValue={doc?.title} />
      </Field>
      <Field label="Summary" htmlFor="summary" help="One line shown in listings.">
        <Input id="summary" name="summary" maxLength={300} defaultValue={doc?.summary} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Folder" htmlFor="folderId">
          <Select id="folderId" name="folderId" defaultValue={selected ?? ""}>
            <option value="">Top level</option>
            {folders
              .filter((f) => canRead(viewer, f.clearance))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPathName(folders, f.id)}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Clearance" htmlFor="clearance" help="Can't be looser than the folder's.">
          <ClearanceSelect viewer={viewer} defaultValue={doc?.clearance ?? folder?.clearance ?? "UNIT"} />
        </Field>
      </div>
      <Field label="Content (Markdown)" htmlFor="content">
        <ImageInsert textareaId="content" />
        <Textarea id="content" name="content" className="min-h-96 font-mono text-xs" defaultValue={doc?.content} />
      </Field>
      <Field label="Related qualifications" htmlFor="qualificationIds" help="Optional. Hold Ctrl or Cmd to pick several. Shown on this document and on each qualification's page.">
        <Select id="qualificationIds" name="qualificationIds" multiple defaultValue={linked ?? []} className="h-40">
          {qualifications.map((q) => (
            <option key={q.id} value={q.id}>
              {q.category} · {q.title}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-4 rounded-md border p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Required reading</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="required" defaultChecked={doc?.required} className="size-4 accent-[var(--accent)]" />
          Members must read and acknowledge this document
        </label>
        <p className="text-xs text-muted-foreground">
          Targets add up: a member is asked if they match any of them. Only active members who can read the document are asked.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="requiredEveryone" defaultChecked={doc?.requiredEveryone} className="size-4 accent-[var(--accent)]" />
          Everyone
        </label>
        <Field label="From rank" htmlFor="requiredMinRank" help="This rank and above.">
          <Select id="requiredMinRank" name="requiredMinRank" defaultValue={doc?.requiredMinRank ?? ""}>
            <option value="">No minimum</option>
            {RANKS.map((r) => (
              <option key={r.abbr} value={r.abbr}>
                {r.abbr} · {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Specific ranks" htmlFor="requiredRanks" help="Ctrl or Cmd to pick several.">
            <Select id="requiredRanks" name="requiredRanks" multiple defaultValue={doc?.requiredRanks ?? []} className="h-40">
              {RANKS.map((r) => (
                <option key={r.abbr} value={r.abbr}>
                  {r.abbr} · {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Billets" htmlFor="requiredRoles" help="Primary or secondary role.">
            <Select id="requiredRoles" name="requiredRoles" multiple defaultValue={doc?.requiredRoles ?? []} className="h-40">
              {UNIT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Squads" htmlFor="requiredSquads">
            <Select id="requiredSquads" name="requiredSquads" multiple defaultValue={doc?.requiredSquads ?? []} className="h-40">
              {SQUADS.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {doc?.required && (
          <div className="flex flex-col gap-2 border-t pt-3 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This edit is</span>
            <label className="flex items-start gap-2">
              <input type="radio" name="change" value="minor" defaultChecked className="mt-1" />
              <span>
                <strong>Minor</strong>: acknowledgements stand (typos, small clarifications).
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="change" value="major" className="mt-1" />
              <span>
                <strong>Major</strong>: everyone must acknowledge again, and they are told on Discord.
              </span>
            </label>
          </div>
        )}
      </fieldset>
      <Field label="Change note" htmlFor="note" help="Optional. Shown in the revision history.">
        <Input id="note" name="note" maxLength={200} />
      </Field>
      <SubmitButton className="self-start">{doc ? "Save" : "Create"}</SubmitButton>
    </ActionForm>
  );
}
