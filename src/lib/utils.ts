export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const THEMES = [
  { key: "green", label: "Green", swatch: "#166534" },
  { key: "navy", label: "Navy", swatch: "#1e3a8a" },
  { key: "maroon", label: "Maroon", swatch: "#7f1d1d" },
  { key: "gold", label: "Gold", swatch: "#a16207" },
  { key: "purple", label: "Purple", swatch: "#6b21a8" },
  { key: "black", label: "Black", swatch: "#18181b" },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];

export function themeSwatch(theme: string) {
  return THEMES.find((t) => t.key === theme)?.swatch ?? "#166534";
}
