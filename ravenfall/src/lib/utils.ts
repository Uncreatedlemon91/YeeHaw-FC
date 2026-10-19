import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach twMerge our custom tokens (globals.css), or it mistakes text-micro for
// a text colour and drops it when merged with e.g. text-success-fg.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["micro"] }], tracking: [{ tracking: ["label", "display"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 80);
}

export function avatarUrl(discordId: string, avatar: string | null | undefined): string {
  if (avatar) return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=128`;
  // Discord's default avatars are picked by (id >> 22) % 6.
  const idx = Number((BigInt(discordId) >> BigInt(22)) % BigInt(6));
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}
