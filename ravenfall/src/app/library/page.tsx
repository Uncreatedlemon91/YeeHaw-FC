import { notFound } from "next/navigation";
import { Browser } from "./browser";

export const metadata = { title: "Library" };

export default async function Library({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (await Browser({ folderId: null, q })) ?? notFound();
}
