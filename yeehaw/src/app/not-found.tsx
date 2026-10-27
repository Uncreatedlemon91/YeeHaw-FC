import Link from "next/link";
import { PublicFrame } from "@/components/public-frame";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PublicFrame kicker="404">
      <h1 className="mt-2 text-3xl font-bold">Offside</h1>
      <p className="mt-4 text-sm text-muted-foreground">That page doesn&apos;t exist, or it was removed.</p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/">Back to the club</Link>
      </Button>
    </PublicFrame>
  );
}
