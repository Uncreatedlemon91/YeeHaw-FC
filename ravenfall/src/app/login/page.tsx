import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth-buttons";
import { Container } from "@/components/container";
import { Logo } from "@/components/logo";
import { UNIT } from "@/config/unit";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

function safe(url: string | undefined) {
  // Only same-site paths, never "//evil.example".
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/dashboard";
}

export default async function Login({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const target = safe(callbackUrl);
  if (await getSessionUser()) redirect(target);

  return (
    <Container className="flex max-w-md flex-col items-center py-24 text-center">
      <Logo className="size-14 text-accent" />
      <h1 className="mt-6 text-3xl font-bold uppercase">{UNIT.siteName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in with the Discord account you use on the {UNIT.name} server. Your access on this site comes from your
        roles there.
      </p>
      {error && (
        <p className="mt-6 w-full rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive-fg">
          Sign-in failed ({error}). Try again, and make sure you approve the Discord prompt.
        </p>
      )}
      <SignInButton callbackUrl={target} size="lg" className="mt-8" />
    </Container>
  );
}
