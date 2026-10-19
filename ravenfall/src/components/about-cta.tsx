import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

/** Closing call to action for About pages: Enlist for guests, their file for operators. */
export async function AboutCta({ title, body }: { title: string; body: string }) {
  const user = await getSessionUser();
  const operator = !!user && hasPerm(user.perms, "OPERATOR");
  return (
    <div className="jacket relative mt-12 flex flex-col items-center gap-4 overflow-hidden rounded-lg border p-8 text-center sm:p-12">
      {!operator && (
        <div aria-hidden className="absolute right-4 top-4 hidden sm:block">
          <span className="stamp stamp-amber">Now enlisting</span>
        </div>
      )}
      <p className="text-micro font-semibold uppercase tracking-label text-muted-foreground">{operator ? "Your file" : "File no. 001 · New recruit"}</p>
      <h2 className="text-3xl font-bold uppercase sm:text-4xl">{operator ? "See where you stand" : title}</h2>
      <p className="max-w-lg text-sm text-muted-foreground">
        {operator ? "Your personnel file shows your rank, billet and what the next step needs." : body}
      </p>
      {operator ? (
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href={`/roster/${user.id}`}>
              Open your file <ChevronRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/roster">View the roster</Link>
          </Button>
        </div>
      ) : (
        <Button asChild size="lg" variant="accent">
          <Link href="/apply">
            Start your application <ChevronRight />
          </Link>
        </Button>
      )}
    </div>
  );
}
