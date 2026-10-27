import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/library";
import { Browser } from "../../browser";

export const metadata = { title: "Library" };

export default async function LibraryFolder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const out = await Browser({ folderId: id });
  if (out) return out;
  // Guests are sent to sign in; anyone else just doesn't see it.
  if (!(await getViewer())) redirect(`/login?callbackUrl=${encodeURIComponent(`/library/f/${id}`)}`);
  notFound();
}
