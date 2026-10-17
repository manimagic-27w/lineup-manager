import {
  BOYS_SLOTS,
  SEVENS_SLOTS,
  SIXES_SLOTS,
  SLOTS,
  SUB_SLOTS,
  type GameFormat,
} from "@/lib/db/schema";

/**
 * Which lineup slots a game has. Sixes and Sevens are the same for everyone; a regular "field"
 * game depends on the team's gender - girls play with 12 starters (SLOTS), boys with 10
 * (BOYS_SLOTS: 3 attack, 3 midfield, 3 defense, 1 goalie). Unknown values fall back to the
 * girls field set, the original behaviour.
 */
export type SlotDef = { key: string; label: string; unit: string; pos: string; sub?: boolean };

/** Whether a game format can have sub spots at all: Field and Sevens, not Sixes (an unknown
 *  format behaves like Field everywhere else, so it does here too). */
export function formatAllowsSubs(format: string): boolean {
  return format !== "sixes";
}

/** The slots a game shows. `subs` adds the sub spots for formats that allow them. */
export function slotsFor(format: string, gender: string, subs = false): readonly SlotDef[] {
  let base: readonly SlotDef[];
  switch (format as GameFormat) {
    case "sixes":
      base = SIXES_SLOTS;
      break;
    case "sevens":
      base = SEVENS_SLOTS;
      break;
    default:
      base = gender === "boys" ? BOYS_SLOTS : SLOTS;
  }
  return subs && formatAllowsSubs(format) ? [...base, ...SUB_SLOTS] : base;
}

export function slotKeysFor(format: string, gender: string, subs = false): Set<string> {
  return new Set(slotsFor(format, gender, subs).map((s) => s.key));
}

/** Every slot any game can have - for labelling or grouping saved lineups regardless of the
 *  team's current gender (History, exports, the activity feed). */
export const ALL_LINEUP_SLOTS: readonly SlotDef[] = [...SLOTS, ...BOYS_SLOTS, ...SIXES_SLOTS, ...SEVENS_SLOTS, ...SUB_SLOTS];

export function fieldFormatLabel(gender: string): string {
  return gender === "boys" ? "Field (10 starters)" : "Field (12 starters)";
}
