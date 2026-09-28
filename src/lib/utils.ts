export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// Game film links are stored as free text (see games.filmUrl) so an already-pasted link never
// fails to save - a coach might paste "hudl.com/..." without the scheme. This is only for
// building an <a href>; it never touches what's actually stored.
export function ensureHttpUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
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

// A team's own color, independent of the app's Navy/Orange/Blue brand theme (see globals.css) -
// this is what shows as the little swatch dot next to a team's name and the top accent stripe on
// its dashboard card. Navy and Orange reuse the exact brand hex values so a team that picks one
// of those looks consistent with the rest of the app; Red, Silver and Green are their own values,
// chosen to read clearly as small swatch dots against a white background (Silver in particular
// avoids the app's own navy-tinted slate-gray scale so it doesn't just look like a pale blue).
export const THEMES = [
  { key: "red", label: "Red", swatch: "#B91C1C" },
  { key: "orange", label: "Orange", swatch: "#E57200" },
  { key: "navy", label: "Navy", swatch: "#232D4B" },
  { key: "silver", label: "Silver", swatch: "#71717A" },
  { key: "green", label: "Green", swatch: "#166534" },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];

export function themeSwatch(theme: string) {
  return THEMES.find((t) => t.key === theme)?.swatch ?? "#166534";
}
