// Shared formatting for a player's grade + experience level, shown next to their name in the
// lineup dropdowns and in the availability list. Experience is free text on the player record,
// but the three levels a club actually uses collapse to a single letter: New, Travel, Rec.
const EXPERIENCE_SYNONYMS: Record<string, string> = {
  new: "N",
  n: "N",
  travel: "T",
  t: "T",
  rec: "R",
  recreation: "R",
  r: "R",
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
