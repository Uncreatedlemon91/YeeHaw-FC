import type { LibraryClearance, LibraryFolder } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { CLEARANCE_HELP, CLEARANCE_LABEL, CLEARANCES, canRead, folderPathName, looser, subtreeIds, type Viewer } from "@/lib/library";
import { createFolder, deleteFolder, updateFolder } from "./actions";

/** Clearance choices: ones the author can read, and not looser than `min`. */
export function ClearanceSelect({
  viewer,
  min,
  name = "clearance",
  defaultValue,
}: {
  viewer: Viewer;
  min?: LibraryClearance | null;
  name?: string;
  defaultValue: LibraryClearance;
}) {
  return (
    <Select id={name} name={name} defaultValue={defaultValue}>
      {CLEARANCES.filter((c) => canRead(viewer, c) && !(min && looser(c, min))).map((c) => (
        <option key={c} value={c}>
          {CLEARANCE_LABEL[c]} — {CLEARANCE_HELP[c]}
        </option>
      ))}
    </Select>
  );
}

/** Folder create / rename / move / delete, for INSTRUCTOR and up. */
export function FolderTools({
  viewer,
  folders,
  current,
  canDeleteFull,
}: {
  viewer: Viewer;
  folders: LibraryFolder[];
  current: LibraryFolder | null;
  canDeleteFull: boolean;
}) {
  const parent = current ? folders.find((f) => f.id === current.parentId) : null;
  const subtree = current ? subtreeIds(folders, current.id) : [];
  const destinations = folders.filter((f) => !subtree.includes(f.id) && canRead(viewer, f.clearance));

  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>New folder{current ? ` in ${current.name}` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createFolder}>
            <input type="hidden" name="parentId" value={current?.id ?? ""} />
            <Field label="Name" htmlFor="new-name">
              <Input id="new-name" name="name" required maxLength={80} />
            </Field>
            <Field label="Clearance" htmlFor="clearance" help="Documents and subfolders can be equal or stricter, never looser.">
              <ClearanceSelect viewer={viewer} min={current?.clearance} defaultValue={current?.clearance ?? "UNIT"} />
            </Field>
            <SubmitButton className="self-start">Create folder</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      {current && (
        <Card>
          <CardHeader>
            <CardTitle>Folder settings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ActionForm action={updateFolder} key={`${current.id}:${current.updatedAt.getTime()}`}>
              <input type="hidden" name="id" value={current.id} />
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required maxLength={80} defaultValue={current.name} />
              </Field>
              <Field label="Located in" htmlFor="parentId">
                <Select id="parentId" name="parentId" defaultValue={parent?.id ?? ""}>
                  <option value="">Top level</option>
                  {destinations.map((f) => (
                    <option key={f.id} value={f.id}>
                      {folderPathName(folders, f.id)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Clearance" htmlFor="clearance" help="Raising it also raises anything inside that was looser.">
                <ClearanceSelect viewer={viewer} min={parent?.clearance} defaultValue={current.clearance} />
              </Field>
              <SubmitButton className="self-start">Save folder</SubmitButton>
            </ActionForm>
            <form action={deleteFolder} className="border-t pt-4">
              <input type="hidden" name="id" value={current.id} />
              <ConfirmButton
                variant="destructive"
                size="sm"
                message={
                  canDeleteFull
                    ? "Delete this folder? Everything inside it, subfolders and documents, is deleted too."
                    : "Delete this folder? (Only an empty folder can be deleted by instructors.)"
                }
              >
                Delete folder
              </ConfirmButton>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
