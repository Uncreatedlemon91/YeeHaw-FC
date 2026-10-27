import type { LibraryDocument, LibraryFolder, Qualification } from "@prisma/client";
import { ActionForm, type ActionState, SubmitButton } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
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
      <Field label="Change note" htmlFor="note" help="Optional. Shown in the revision history.">
        <Input id="note" name="note" maxLength={200} />
      </Field>
      <SubmitButton className="self-start">{doc ? "Save" : "Create"}</SubmitButton>
    </ActionForm>
  );
}
