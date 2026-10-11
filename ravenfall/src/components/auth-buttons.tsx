"use client";

import { LogIn, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { Button, type ButtonProps } from "@/components/ui/button";

export function SignInButton({ callbackUrl = "/dashboard", children, ...props }: ButtonProps & { callbackUrl?: string }) {
  return (
    <Button onClick={() => signIn("discord", { callbackUrl })} {...props}>
      {children ?? (
        <>
          <LogIn /> Sign in with Discord
        </>
      )}
    </Button>
  );
}

export function SignOutButton(props: ButtonProps) {
  return (
    <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/" })} {...props}>
      <LogOut /> Sign out
    </Button>
  );
}
