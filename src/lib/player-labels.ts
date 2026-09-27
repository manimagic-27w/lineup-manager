// Shared formatting for a player's grade + experience level, shown next to their name in the
// lineup dropdowns and in the availability list. Experience is free text on the player record
// (see EXPERIENCE_LEVELS in @/lib/db/schema for the roster page's dropdown options), but every
// level - current or older free-text data entered before the dropdown existed - collapses to a
// single letter here.
const EXPERIENCE_SYNONYMS: Record<string, string> = {
  new: "N",
  n: "N",
  travel: "T",
  t: "T",
  rec: "R",
  r: "R",
  // Older synonyms, from before "Rec" was the roster page's label for this level (it was
  // briefly "Red" for a short time too).
  red: "R",
  recreation: "R",
  a: "A",
  b: "B",
  c: "C",
};

export function experienceLetter(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return EXPERIENCE_SYNONYMS[key] ?? null;
}

// Shows whichever of grade/experience is actually there - "11T" with both, just "T" with no
// grade, just "11" with no recognized experience level - so a player missing one still gets a
// useful label next to their name instead of nothing at all. Null only when neither is present.
export function formatGradeExperience(
  grade: string | null | undefined,
  experience: string | null | undefined
): string | null {
  const trimmedGrade = grade?.trim();
  const expLetter = experienceLetter(experience);
  if (!trimmedGrade && !expLetter) return null;
  return `${trimmedGrade ?? ""}${expLetter ?? ""}`;
}
