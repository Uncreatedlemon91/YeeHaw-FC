"use client";

import { Button, type ButtonProps } from "@/components/ui/button";

/** A submit button that asks first. For destructive one-click forms. */
export function ConfirmButton({ message, ...props }: ButtonProps & { message: string }) {
  return (
    <Button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...props}
    />
  );
}
