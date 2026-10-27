import { Hammer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Stands in for a section a later build phase fills in. The route, its
 * navigation entry and its permission check already exist; only the body is
 * missing. Delete the usage when the real page lands.
 */
export function Placeholder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hammer aria-hidden className="size-4 text-muted-foreground" /> {title}
        </CardTitle>
        <CardDescription>Not built yet.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}
