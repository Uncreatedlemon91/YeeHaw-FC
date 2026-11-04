import { redirect } from "next/navigation";

// The qualification builder moved to /admin/qualifications.
export default async function EditQualification({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/admin/qualifications/${(await params).slug}`);
}
