import { cn } from "@/lib/utils";

/**
 * Shared frame for the small standalone pages (login, denied, 404): a navy
 * panel with a red top edge, an optional kicker and a centred body.
 */
export function PublicFrame({
  kicker,
  icon,
  className,
  children,
}: {
  /** Small label above the panel, e.g. "Restricted". */
  kicker: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <p className="field-label mb-2 ml-1">{kicker}</p>
      <div className={cn("folder-tab relative overflow-hidden rounded-lg border p-6 sm:p-8", className)}>
        <div className="flex flex-col items-center text-center">
          {icon}
          {children}
        </div>
      </div>
    </div>
  );
}
