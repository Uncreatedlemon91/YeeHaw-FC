"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container className="max-w-lg py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-label text-destructive-fg">Fault</p>
      <h1 className="mt-2 text-3xl font-bold uppercase">Something broke</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        That page hit an error. Try again, or head back to base.
        {error.digest && <span className="typed mt-2 block text-micro">Ref {error.digest}</span>}
      </p>
      <div className="mt-8 flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Return to base</Link>
        </Button>
      </div>
    </Container>
  );
}
