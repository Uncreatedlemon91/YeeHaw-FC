import { Container } from "@/components/container";

// Route-level skeleton in the redacted-bar / tac-grid style.
export default function Loading() {
  const widths = ["w-11/12", "w-3/4", "w-5/6", "w-2/3", "w-1/2"];
  return (
    <Container role="status" aria-busy="true" aria-label="Loading">
      <div className="tac-grid mb-6 flex flex-col gap-3 border-b pb-5">
        <div className="redacted-bar h-3 w-28 animate-pulse" />
        <div className="redacted-bar h-8 w-64 max-w-full animate-pulse" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-6">
        {widths.map((w, i) => (
          <div key={i} className={`redacted-bar animate-pulse ${w}`} />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </Container>
  );
}
