import Link from "next/link";
import { PublicFrame } from "@/components/public-frame";
import { Redacted } from "@/components/redacted";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PublicFrame tab="File 404" stamp="Not found" stampClassName="stamp-amber">
      <p className="mt-6 text-xs font-semibold uppercase tracking-label text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold uppercase">Off the map</h1>
      <p className="mt-4 text-sm text-muted-foreground">That page doesn't exist, or it was removed.</p>
      <div className="mt-6 w-full text-left">
        <Redacted clearance="Classified" lines={3} />
      </div>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/">Return to base</Link>
      </Button>
    </PublicFrame>
  );
}
