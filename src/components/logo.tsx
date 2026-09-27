import { cn } from "@/lib/utils";

/**
 * The "LINEUP MANAGER" wordmark: LINEUP in brand orange, MANAGER in brand blue, both outlined in
 * navy - the app's three theme colors (see the @theme block in globals.css, which is where the
 * exact hex values below are also defined; kept literal here rather than reading CSS variables
 * since this renders as inline styles, not Tailwind classes).
 */
export function Logo({ className }: { className?: string }) {
  const wordStyle = (color: string): React.CSSProperties => ({
    color,
    WebkitTextStroke: "0.06em #232D4B",
    paintOrder: "stroke fill",
  });

  return (
    <span
      className={cn("inline-flex items-baseline gap-[0.22em] whitespace-nowrap", className)}
      style={{ fontFamily: "'Anton', sans-serif", letterSpacing: "0.02em" }}
    >
      <span style={wordStyle("#E57200")}>LINEUP</span>
      <span style={wordStyle("#1CA8DB")}>MANAGER</span>
    </span>
  );
}
