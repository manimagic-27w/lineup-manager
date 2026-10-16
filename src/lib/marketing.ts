/**
 * Content and tiny helpers for the public front page (/ for signed-out visitors, /demo).
 * Kept free of React so the ordering/lookup rules are covered by plain unit tests.
 */

/** Where "Request an invite" goes until club sign-up and payment are decided. */
export const REQUEST_ACCESS_EMAIL = "jeffrey.haid@gmail.com";
export const REQUEST_ACCESS_HREF = `mailto:${REQUEST_ACCESS_EMAIL}?subject=${encodeURIComponent(
  "Lineup Manager invite request"
)}&body=${encodeURIComponent("Hi! I'd like to try Lineup Manager.\n\nClub name:\nTeam(s) / age group:\nMy name:\n")}`;

export type Audience = "coach" | "club";

export function audienceFromParam(value: string | string[] | undefined): Audience {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "club" ? "club" : "coach";
}

export type DemoStepId = "availability" | "lineup" | "games" | "roster" | "guests" | "history" | "admin";

export type DemoStep = {
  id: DemoStepId;
  /** Short label for the step list. */
  label: string;
  /** Who gets the most out of this screen. */
  audience: "Coaches" | "Club admins" | "Everyone";
  title: string;
  /** What the visitor is looking at, in plain language. */
  caption: string;
  /** Things to notice on the screen. */
  notice: string[];
};

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "availability",
    label: "Collect availability",
    audience: "Coaches",
    title: "Set everyone's availability in one place",
    caption:
      "Every game has its own availability list. As families reply by text or email, you set each player to Available, Maybe or Not Available. No more scrolling a group chat to work out who is coming.",
    notice: [
      "Each change saves instantly, with a small check mark so you know it took.",
      "Playing a tournament weekend? \"Copy availability from another game\" fills in the rest of the weekend in one click, without overwriting anything you already entered.",
    ],
  },
  {
    id: "lineup",
    label: "Build the lineup",
    audience: "Coaches",
    title: "Build the game-day lineup",
    caption:
      "Pick a player for each slot. Only players who are Available or Maybe show up as choices, so you can't accidentally start someone who isn't coming. Everyone else lands on the bench automatically.",
    notice: [
      "A Maybe player in the lineup is highlighted yellow as a reminder to confirm with them.",
      "If a starter's status changes later, their name turns red so you notice and can swap them out.",
      "Field, Sevens and Sixes games each get the right set of slots.",
    ],
  },
  {
    id: "games",
    label: "Games and scores",
    audience: "Coaches",
    title: "Track your games, scores and record",
    caption:
      "Your schedule shows every game with its final score and a win, loss or tie badge. Group a weekend's games under a tournament, mark scrimmages as friendlies so they stay out of your record, and filter by season.",
    notice: [
      "The record at the top is worked out for you from the scores you enter.",
      "Friendlies keep their score but don't count toward the record.",
    ],
  },
  {
    id: "roster",
    label: "Roster",
    audience: "Everyone",
    title: "Keep your roster tidy",
    caption:
      "Add players one at a time or paste in a CSV. Set position and experience right in the table, then save them all at once. Archive a player who is out for the season and their history stays intact.",
    notice: [
      "Travel and Rec teams get the experience levels that make sense for them.",
      "When you add a player you choose Core roster or Guest.",
    ],
  },
  {
    id: "guests",
    label: "Guest players",
    audience: "Coaches",
    title: "Bring in guest players without touching your roster",
    caption:
      "Short a player, or borrowing one for a tournament? Add a guest to just that game. Guests live on their own guest roster, so you can reuse them next time without cluttering your core roster.",
    notice: [
      "Guests appear under their own divider in the availability list and are tagged in the lineup.",
      "Typing a name you've used before reuses that guest instead of creating a duplicate.",
    ],
  },
  {
    id: "history",
    label: "Start history",
    audience: "Coaches",
    title: "See who has played where",
    caption:
      "The History tab counts every player's starts by position, built automatically from the lineups you already set. Click a player to see the game-by-game breakdown. Guests are listed below your core roster under their own divider.",
    notice: [
      "Great for making sure playing time and positions stay fair across the season.",
      "There's nothing extra to fill in. It updates as you build lineups.",
    ],
  },
  {
    id: "admin",
    label: "Club admin",
    audience: "Club admins",
    title: "Invite coaches and organize your teams",
    caption:
      "Club admins create teams, invite coaches by email and choose which teams each coach can see. Coaches only see the teams they're assigned to, and an activity log shows who changed what.",
    notice: [
      "Run several teams, Travel or Rec, from one club.",
      "Export your rosters and games to CSV or Excel whenever you need a backup.",
    ],
  },
];

export function stepIndexFromParam(value: string | string[] | undefined): number {
  const v = Array.isArray(value) ? value[0] : value;
  const i = DEMO_STEPS.findIndex((s) => s.id === v);
  return i >= 0 ? i : 0;
}

export function adjacentStep(index: number, delta: 1 | -1): number {
  const next = index + delta;
  if (next < 0 || next >= DEMO_STEPS.length) return index;
  return next;
}
