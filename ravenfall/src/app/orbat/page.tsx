import { redirect } from "next/navigation";

// The ORBAT is now the roster's default view; keep old links working.
export default function Orbat() {
  redirect("/roster");
}
