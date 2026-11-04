import { Film, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { UNIT } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";
import { addVideo, removeItem } from "./actions";
import { ImageUpload } from "./image-upload";

export const metadata = { title: "Media" };

export default async function Media() {
  await requireUser("RECRUITER", "/admin/media");
  const [items, events] = await Promise.all([
    prisma.galleryItem.findMany({ orderBy: { createdAt: "desc" }, include: { event: { select: { title: true } }, uploader: { select: { callsign: true, discordUsername: true } } } }),
    prisma.event.findMany({ where: { startTime: { lt: new Date() } }, orderBy: { startTime: "desc" }, take: 40, select: { id: true, title: true, startTime: true } }),
  ]);
  const eventOptions = events.map((e) => ({ id: e.id, label: `${e.title} (${fmt(e.startTime, "d MMM yyyy")})` }));

  return (
    <Container>
      <PageHeader
        eyebrow="Recruitment"
        title="Media"
        description="Screenshots and videos for the public home page's “From the field” section: the newest 12 images and 4 videos show. Everything here is public."
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add a screenshot</CardTitle>
          </CardHeader>
          <CardContent>
            <ImageUpload events={eventOptions} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Add a video</CardTitle>
            <CardDescription>A YouTube link. Visitors' browsers only contact YouTube when they press play.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={addVideo}>
              <Field label="YouTube link" htmlFor="url">
                <Input id="url" name="url" required placeholder="https://www.youtube.com/watch?v=…" />
              </Field>
              <Field label="Caption (optional)" htmlFor="v-caption">
                <Input id="v-caption" name="caption" maxLength={200} />
              </Field>
              <Field label="Operation (optional)" htmlFor="v-event">
                <Select id="v-event" name="eventId" defaultValue="">
                  <option value="">None</option>
                  {eventOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton className="self-start" pendingText="Adding…">
                Add video
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-bold uppercase">On the home page</h2>
      {UNIT.media.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">Plus {UNIT.media.length} video(s) listed in the site config (src/config/unit.ts).</p>
      )}
      {items.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((i) => (
            <li key={i.id} className="flex flex-col overflow-hidden rounded-lg border bg-card">
              {i.kind === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/gallery/${i.id}`} alt={i.caption || "Gallery screenshot"} className="aspect-video w-full object-cover" loading="lazy" />
              ) : (
                <a href={`https://www.youtube.com/watch?v=${i.youtubeId}`} className="tac-grid flex aspect-video items-center justify-center gap-2 text-sm text-accent hover:underline">
                  <Film className="size-5" aria-hidden /> YouTube video
                </a>
              )}
              <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
                <span className="font-semibold">{i.caption || <span className="text-muted-foreground">No caption</span>}</span>
                {i.event && <span className="text-xs text-muted-foreground">{i.event.title}</span>}
                <span className="text-micro text-muted-foreground">
                  {fmt(i.createdAt, "d MMM yyyy")} · {i.uploader?.callsign ?? i.uploader?.discordUsername ?? "unknown"}
                </span>
                <form action={removeItem} className="mt-auto pt-2">
                  <input type="hidden" name="id" value={i.id} />
                  <ConfirmButton variant="ghost" size="sm" message="Remove this from the home page? An image is deleted for good.">
                    <Trash2 /> Remove
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing yet. Add a screenshot or a video above.</p>
      )}
    </Container>
  );
}
