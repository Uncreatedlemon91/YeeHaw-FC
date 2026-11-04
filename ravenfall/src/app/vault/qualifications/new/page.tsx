import { redirect } from "next/navigation";

// The qualification builder moved to /admin/qualifications.
export default function NewQualification() {
  redirect("/admin/qualifications/new");
}
