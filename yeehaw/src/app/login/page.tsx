import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth-buttons";
import { Logo } from "@/components/logo";
import { PublicFrame } from "@/components/public-frame";
import { CLUB } from "@/config/club";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

function safe(url: string | undefined) {
  // Only same-site paths, never "//evil.example".
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

// NextAuth's ?error= codes, in plain words.
const ERRORS: Record<string, string> = {
  OAuthSignin: "We couldn't start the Discord sign-in. Give it another try in a moment.",
  OAuthCallback: "Discord didn't complete the sign-in. Try again, and approve the Discord prompt when it appears.",
  OAuthCreateAccount: "We couldn't create your account from Discord. Try again, or ask the club staff for help.",
  OAuthAccountNotLinked: "That Discord account is linked to a different sign-in. Use the account you first signed in with.",
  Callback: "Something went wrong while finishing the sign-in. Try again.",
  AccessDenied: "Access was denied. Make sure you approve the Discord prompt, and that you're allowed to use this site.",
  SessionRequired: "Sign in to view that page.",
  Configuration: "Sign-in is temporarily unavailable. Let a site admin know.",
};
const DEFAULT_ERROR = "Sign-in failed. Try again, and make sure you approve the Discord prompt.";

export default async function Login({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const target = safe(callbackUrl);
  if (await getSessionUser()) redirect(target);

  return (
    <PublicFrame kicker="Sign in" icon={<Logo className="size-14 text-accent" />}>
      <h1 className="mt-5 text-3xl font-bold">{CLUB.siteName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in with the Discord account you use on the {CLUB.name} server. Your access on this site comes from your
        roles there.
      </p>
      {error && (
        <p role="alert" className="mt-6 w-full rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive-fg">
          {ERRORS[error] ?? DEFAULT_ERROR}
        </p>
      )}
      <SignInButton callbackUrl={target} size="lg" className="mt-8" />
    </PublicFrame>
  );
}
