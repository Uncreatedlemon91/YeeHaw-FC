import { cn } from "@/lib/utils";

/**
 * Shared frame for the small standalone pages (login, denied, 404): a jacket
 * folder with a manila tab, an optional rubber stamp and a centred body.
 */
export function PublicFrame({
  tab,
  stamp,
  stampClassName,
  icon,
  className,
  children,
}: {
  /** Text on the manila tab, e.g. "Restricted". */
  tab: string;
  /** Rubber stamp in the corner, e.g. "Denied". */
  stamp?: string;
  stampClassName?: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <div className="ml-4 inline-block">
        <div className="jacket-tab px-6 pb-1 pt-1.5 text-micro font-bold uppercase tracking-label">{tab}</div>
      </div>
      <div className={cn("jacket relative overflow-hidden rounded-lg rounded-tl-none border p-6 sm:p-8", className)}>
        {stamp && (
          <span aria-hidden className={cn("stamp absolute right-4 top-4", stampClassName)}>
            {stamp}
          </span>
        )}
        <div className="flex flex-col items-center text-center">
          {icon}
          {children}
        </div>
      </div>
    </div>
  );
}
