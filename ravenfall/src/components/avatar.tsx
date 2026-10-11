import { avatarUrl, cn } from "@/lib/utils";

// Plain <img>: Discord's CDN already serves sized PNGs, so next/image's
// optimiser would only add work for the droplet.
export function Avatar({
  discordId,
  avatar,
  size = 32,
  className,
}: {
  discordId: string;
  avatar: string | null | undefined;
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl(discordId, avatar)}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-sm border bg-muted", className)}
    />
  );
}
