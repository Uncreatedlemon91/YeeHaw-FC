import { Badge } from "@/components/ui/badge";

/** Server-rendered relative age. Pending applications past 48h (the promised review window) turn amber. */
export function AppAge({ date, pending }: { date: Date; pending?: boolean }) {
  const h = Math.floor((Date.now() - date.getTime()) / 3600_000);
  const text = h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  if (pending && h >= 48) return <Badge variant="warning">{text}</Badge>;
  return <span className="text-muted-foreground">{text}</span>;
}
