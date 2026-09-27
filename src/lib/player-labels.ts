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
  red: "R",
  r: "R",
  // Older synonyms, from before "Red" was the roster page's label for this level.
  rec: "R",
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

// Only shown when BOTH grade and a recognized experience level are present - e.g. "11T".
export function formatGradeExperience(
  grade: string | null | undefined,
  experience: string | null | undefined
): string | null {
  const trimmedGrade = grade?.trim();
  const expLetter = experienceLetter(experience);
  if (!trimmedGrade || !expLetter) return null;
  return `${trimmedGrade}${expLetter}`;
}
