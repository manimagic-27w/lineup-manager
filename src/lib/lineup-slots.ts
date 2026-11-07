import {
  BOYS_SLOTS,
  EXTRA_MID_SLOTS,
  MAX_EXTRA_MIDS,
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

/** Whether a game format can have extra midfield lines (Middie 4 / 5): every format with midfielders,
 *  so everything but Sixes. */
export function formatAllowsExtraMids(format: string): boolean {
  return format !== "sixes";
}

/** Keeps an extra-midfield-line count to a whole number from 0 to MAX_EXTRA_MIDS. */
export function clampExtraMids(n: number): number {
  return Number.isFinite(n) ? Math.min(MAX_EXTRA_MIDS, Math.max(0, Math.trunc(n))) : 0;
}

/** The extra midfield slots (Middie 4, Middie 5) that belong to a game's slot family, in order. */
function extraMidSlotsFor(format: string, gender: string): readonly SlotDef[] {
  if (format === "sixes") return [];
  const prefix = format === "sevens" ? "7M" : gender === "boys" ? "BM" : "M";
  return EXTRA_MID_SLOTS.filter((s) => s.key.startsWith(prefix) && s.key.length === prefix.length + 1);
}

/** The slots a game shows. `subs` adds the sub spots for formats that allow them, and `extraMids`
 *  (0-2) adds Middie 4 / Middie 5 right after the last starting midfielder. */
export function slotsFor(format: string, gender: string, subs = false, extraMids = 0): readonly SlotDef[] {
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
  let withMids: readonly SlotDef[] = base;
  const extras = extraMidSlotsFor(format, gender).slice(0, clampExtraMids(extraMids));
  if (extras.length > 0) {
    let at = -1;
    base.forEach((s, i) => {
      if (s.unit === "Midfield") at = i;
    });
    if (at >= 0) withMids = [...base.slice(0, at + 1), ...extras, ...base.slice(at + 1)];
  }
  return subs && formatAllowsSubs(format) ? [...withMids, ...SUB_SLOTS] : withMids;
}

const SUB_SLOT_KEY_SET: ReadonlySet<string> = new Set(SUB_SLOTS.map((s) => s.key));

/** True for the optional sub spots (SUB_SLOTS). A player can hold one starting slot and one sub
 *  slot in the same game - e.g. start at attack and be the first midfield sub. */
export function isSubSlotKey(key: string): boolean {
  return SUB_SLOT_KEY_SET.has(key);
}

export function slotKeysFor(format: string, gender: string, subs = false, extraMids = 0): Set<string> {
  return new Set(slotsFor(format, gender, subs, extraMids).map((s) => s.key));
}

/** Every slot any game can have - for labelling or grouping saved lineups regardless of the
 *  team's current gender (History, exports, the activity feed). */
export const ALL_LINEUP_SLOTS: readonly SlotDef[] = [...SLOTS, ...BOYS_SLOTS, ...SIXES_SLOTS, ...SEVENS_SLOTS, ...EXTRA_MID_SLOTS, ...SUB_SLOTS];

/** The key of the last extra midfield slot a game shows (e.g. "M5"), or null with none. */
export function lastExtraMidKey(format: string, gender: string, extraMids: number): string | null {
  const shown = extraMidSlotsFor(format, gender).slice(0, clampExtraMids(extraMids));
  return shown.length > 0 ? shown[shown.length - 1].key : null;
}

export function fieldFormatLabel(gender: string): string {
  return gender === "boys" ? "Field (10 starters)" : "Field (12 starters)";
}
