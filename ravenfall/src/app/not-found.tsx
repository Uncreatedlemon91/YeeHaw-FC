import Link from "next/link";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Container className="max-w-lg py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold uppercase">Off the map</h1>
      <p className="mt-4 text-sm text-muted-foreground">That page doesn't exist, or it was removed.</p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/">Return to base</Link>
      </Button>
    </Container>
  );
}
