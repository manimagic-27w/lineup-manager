import { cn } from "@/lib/utils";

/**
 * The "LINEUP MANAGER" wordmark: LINEUP in the jersey red, MANAGER in the jersey blue, both with
 * a white outline (the same treatment as the number on the 3D Virginia jersey this palette was
 * pulled from). Renders inline at whatever font-size the caller sets - no size baked in here.
 */
export function Logo({ className }: { className?: string }) {
  const wordStyle = (color: string): React.CSSProperties => ({
    color,
    WebkitTextStroke: "0.06em #FFFFFF",
    paintOrder: "stroke fill",
  });

  return (
    <span
      className={cn("inline-flex items-baseline gap-[0.22em] whitespace-nowrap", className)}
      style={{ fontFamily: "'Anton', sans-serif", letterSpacing: "0.02em" }}
    >
      <span style={wordStyle("#D2232A")}>LINEUP</span>
      <span style={wordStyle("#1CA8DB")}>MANAGER</span>
    </span>
  );
}
