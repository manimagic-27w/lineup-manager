import Link from "next/link";
import { cn } from "@/lib/utils";

/** Pick which games feed a stats page: everything, one season, or games with no season. */
export function SeasonPills({
  basePath,
  seasons,
  current,
  hasUnassigned,
}: {
  basePath: string;
  seasons: { id: string; name: string }[];
  current: string;
  hasUnassigned: boolean;
}) {
  const options = [
    { key: "all", label: "All games" },
    ...seasons.map((s) => ({ key: s.id, label: s.name })),
    ...(hasUnassigned && seasons.length > 0 ? [{ key: "none", label: "No season" }] : []),
  ];
  if (options.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {options.map((o) => (
        <Link
          key={o.key}
          href={o.key === "all" ? basePath : `${basePath}?season=${o.key}`}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium",
            current === o.key ? "border-brand-blue bg-brand-blue text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
