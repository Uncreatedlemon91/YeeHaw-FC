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
      <p className="text-xs font-semibold tracking-label text-destructive-fg font-mono uppercase">Fault</p>
      <h1 className="mt-2 text-3xl font-bold">Something broke</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        That page hit an error. Try again, or head back to the club.
        {error.digest && <span className="mt-2 font-mono block text-micro">Ref {error.digest}</span>}
      </p>
      <div className="mt-8 flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to the club</Link>
        </Button>
      </div>
    </Container>
  );
}
