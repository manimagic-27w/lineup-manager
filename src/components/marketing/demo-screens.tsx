import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import type { DemoStepId } from "@/lib/marketing";

/**
 * Look-alike screens of the real app, filled with made-up sample data, for the public demo.
 * They are purely presentational: no server actions, no inputs that do anything, nothing is
 * saved. The tour wraps them in an element that ignores pointer events.
 */

const STATUS_STYLES: Record<string, string> = {
  Available: "bg-emerald-100 text-emerald-800",
  "Not Available": "bg-red-100 text-red-800",
  Maybe: "bg-amber-100 text-amber-800",
  "No Response": "bg-slate-100 text-slate-600",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full px-2 py-1 text-xs font-medium", STATUS_STYLES[status])}>{status} ▾</span>
  );
}

function FakeSelect({
  children,
  className = "w-full",
  tone,
}: {
  children: ReactNode;
  /** Width classes. */
  className?: string;
  tone?: "maybe" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-between rounded-md border px-2 py-1 text-sm",
        tone === "maybe"
          ? "border-amber-300 bg-amber-50 text-slate-900"
          : tone === "warn"
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-slate-300 bg-white text-slate-900",
        className
      )}
    >
      <span className="truncate">{children}</span>
      <span className="ml-1 text-slate-400">▾</span>
    </span>
  );
}

const TABS = ["Roster", "Games", "Stats", "History", "Activity", "Settings"];

function AppChrome({ active, children }: { active?: string; children: ReactNode }) {
  return (
    <div className="bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <Logo className="text-lg" />
          <span className="text-xs text-slate-500">Riverside Lacrosse Club</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="h-4 w-4 rounded-full bg-brand-orange" aria-hidden />
          <span className="text-sm font-semibold text-slate-900">Riverside Rockets</span>
        </div>
        <nav className="mt-2 flex gap-4 overflow-hidden text-xs">
          {TABS.map((t) => (
            <span
              key={t}
              className={cn(
                "border-b-2 pb-1.5 font-medium",
                t === active ? "border-brand-orange text-brand-orange" : "border-transparent text-slate-500"
              )}
            >
              {t}
            </span>
          ))}
        </nav>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function GameBar({ label }: { label: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-900">{label}</span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">Field</span>
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">Spring Classic</span>
    </div>
  );
}

const ROSTER = [
  { name: "Ava Chen", pos: "Attack", n: "7", status: "Available" },
  { name: "Emma Ross", pos: "Attack", n: "22", status: "Available" },
  { name: "Mia Torres", pos: "Mid", n: "12", status: "Maybe" },
  { name: "Nora Kim", pos: "Mid", n: "9", status: "Available" },
  { name: "Ruby Diaz", pos: "Mid", n: "15", status: "Not Available" },
  { name: "Zoe Patel", pos: "Def", n: "3", status: "Available" },
  { name: "Ivy Walsh", pos: "Def", n: "5", status: "No Response" },
  { name: "Lily Brooks", pos: "Goalie", n: "1", status: "Available" },
];

function AvailabilityScreen() {
  return (
    <AppChrome active="Games">
      <GameBar label="Sat, Apr 11 · vs Eagles" />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="space-y-1.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <span className="block text-xs font-medium text-slate-600">Copy availability from another game</span>
          <div className="flex gap-2">
            <FakeSelect className="min-w-0 flex-1">Same tournament · Sat, Apr 11 vs Hawks</FakeSelect>
            <span className="rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white">Import</span>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {ROSTER.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3 px-4 py-2">
              <div>
                <span className="font-medium text-slate-900">{p.name}</span>
                <span className="ml-2 text-xs text-slate-500">{p.pos}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={p.status} />
                {p.name === "Mia Torres" && <span className="text-xs text-emerald-600">✓</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppChrome>
  );
}

function Slot({ label, player, tone }: { label: string; player: string; tone?: "maybe" | "warn" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-slate-500">{label}</span>
      <FakeSelect tone={tone}>{player}</FakeSelect>
    </div>
  );
}

function LineupScreen() {
  return (
    <AppChrome active="Games">
      <GameBar label="Sat, Apr 11 · vs Eagles" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { unit: "Attack", slots: [["Low Attack 1", "#7 Ava Chen-A"], ["Low Attack 2", "#22 Emma Ross-A"], ["High Attack 1", "#11 Tessa Grant-A"]] },
          { unit: "Midfield", slots: [["Middie 1", "#12 Mia Torres-M", "maybe"], ["Middie 2", "#15 Ruby Diaz-M", "warn"], ["Middie 3", "#9 Nora Kim-M"]] },
          { unit: "Defense", slots: [["High Defense 1", "#3 Zoe Patel-D"], ["High Defense 2", "#14 Kate Lopez-D"], ["Low Defense 1", "Choose a player…"]] },
          { unit: "Goalie", slots: [["Goalie", "#1 Lily Brooks-G"]] },
        ].map((g) => (
          <div key={g.unit} className="rounded-lg border border-slate-200 bg-white p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.unit}</h4>
            <div className="space-y-1.5">
              {g.slots.map(([label, player, tone]) => (
                <Slot key={label} label={label} player={player} tone={tone as "maybe" | "warn" | undefined} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bench</h4>
        <div className="flex flex-wrap gap-2 text-sm text-slate-700">
          <span className="rounded-full bg-slate-100 px-2 py-0.5">Ivy Walsh</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5">Sam Ortiz</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-300" /> Maybe
        <span className="mx-2" />
        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-300" /> No longer available
      </p>
    </AppChrome>
  );
}

const GAMES = [
  { date: "Sat, Apr 11, 2026", opp: "vs Eagles", result: "W", score: "9–6" },
  { date: "Sat, Apr 11, 2026", opp: "vs Hawks", result: "L", score: "5–7" },
  { date: "Sun, Apr 12, 2026", opp: "vs Comets", result: "W", score: "11–4", friendly: false },
];

function GamesScreen() {
  const badge = (r: string) =>
    r === "W" ? "bg-green-100 text-green-800" : r === "L" ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-700";
  return (
    <AppChrome active="Games">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-700">
          Record <span className="font-bold text-slate-900">4–1–1</span>
          <span className="ml-2 text-xs text-slate-500">· 1 friendly not counted</span>
        </p>
        <FakeSelect className="w-36">Spring 2026</FakeSelect>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="bg-slate-100 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Spring Classic
        </div>
        <ul className="divide-y divide-slate-100">
          {GAMES.map((g) => (
            <li key={g.opp} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium text-slate-900">{g.date}</div>
                <div className="text-sm text-slate-500">{g.opp}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("rounded-md px-2 py-1 text-xs font-bold", badge(g.result))}>{g.result}</span>
                <span className="text-lg font-bold tabular-nums text-slate-900">{g.score}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="bg-slate-100 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Other games
        </div>
        <ul className="divide-y divide-slate-100">
          <li className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">Sat, Apr 4, 2026</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  Friendly
                </span>
              </div>
              <div className="text-sm text-slate-500">vs Lakers</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-green-100 px-2 py-1 text-xs font-bold text-green-800">W</span>
              <span className="text-lg font-bold tabular-nums text-slate-900">8–3</span>
            </div>
          </li>
          <li className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-medium text-slate-900">Sat, Apr 18, 2026</div>
              <div className="text-sm text-slate-500">vs Titans</div>
            </div>
            <span className="text-xs text-slate-400">Upcoming</span>
          </li>
        </ul>
      </div>
    </AppChrome>
  );
}

function RosterScreen() {
  return (
    <AppChrome active="Roster">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Position</th>
              <th className="px-3 py-2">Experience</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ROSTER.slice(0, 5).map((p, i) => (
              <tr key={p.name}>
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="px-3 py-2">{p.n}</td>
                <td className="px-3 py-2">
                  <FakeSelect className="w-24">{p.pos}</FakeSelect>
                </td>
                <td className="px-3 py-2">
                  <FakeSelect className="w-16">{["A", "A", "B", "B", "C"][i]}</FakeSelect>
                </td>
                <td className="px-3 py-2 text-right text-xs text-slate-500">Edit · Archive</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="rounded-md bg-brand-orange px-3 py-1 text-sm font-medium text-white">Save roster changes</span>
          <span className="text-xs text-slate-500">2 players changed</span>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Add a player</h4>
        <div className="flex flex-wrap items-end gap-2">
          {["Name", "#", "Position", "Experience"].map((l) => (
            <div key={l} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">{l}</span>
              <span className="h-8 w-24 rounded-md border border-slate-300 bg-white" />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">Type</span>
            <FakeSelect className="w-32">Core roster</FakeSelect>
          </div>
          <span className="rounded-md bg-brand-orange px-3 py-1.5 text-sm font-medium text-white">Add player</span>
        </div>
      </div>
    </AppChrome>
  );
}

function GuestsScreen() {
  const core = ROSTER.slice(0, 4);
  return (
    <AppChrome active="Games">
      <GameBar label="Sun, Apr 12 · vs Comets" />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <span className="inline-block rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Close</span>
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-600">Pick from your guest roster</span>
            <div className="flex gap-2">
              <FakeSelect className="min-w-0 flex-1">Gia Morales #18 · Mid</FakeSelect>
              <span className="rounded-md bg-brand-orange px-3 py-1 text-sm font-medium text-white">Add to game</span>
            </div>
          </div>
          <p className="text-xs font-medium text-slate-600">Or add a new guest</p>
          <div className="flex flex-wrap gap-2">
            <span className="h-8 w-32 rounded-md border border-slate-300 bg-white" />
            <span className="h-8 w-12 rounded-md border border-slate-300 bg-white" />
            <span className="rounded-md bg-brand-orange px-3 py-1.5 text-sm font-medium text-white">Add guest</span>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {core.map((p) => (
            <li key={p.name} className="flex items-center justify-between px-4 py-2">
              <div>
                <span className="font-medium text-slate-900">{p.name}</span>
                <span className="ml-2 text-xs text-slate-500">{p.pos}</span>
              </div>
              <StatusPill status={p.status} />
            </li>
          ))}
          <li className="bg-slate-100 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Guests
          </li>
          <li className="flex items-center justify-between px-4 py-2">
            <div>
              <span className="font-medium text-slate-900">Gia Morales</span>
              <span className="ml-2 text-xs text-slate-500">Mid</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status="Available" />
              <span className="text-xs text-slate-400">✕</span>
            </div>
          </li>
        </ul>
      </div>
    </AppChrome>
  );
}

const HISTORY = [
  { name: "Ava Chen", n: "7", c: [5, 0, 0, 0, 0] },
  { name: "Emma Ross", n: "22", c: [3, 2, 0, 0, 0] },
  { name: "Mia Torres", n: "12", c: [0, 5, 0, 0, 0] },
  { name: "Zoe Patel", n: "3", c: [0, 0, 5, 0, 0] },
  { name: "Lily Brooks", n: "1", c: [0, 0, 0, 5, 0] },
];

function HistoryScreen() {
  const cols = ["Attack", "Mid", "Def", "Goalie", "Sixes"];
  const row = (p: { name: string; n: string; c: number[] }) => (
    <tr key={p.name}>
      <td className="px-3 py-2 font-medium">
        <span className="mr-2 inline-block w-3 text-slate-400">▸</span>
        {p.name} #{p.n}
      </td>
      {p.c.map((v, i) => (
        <td key={i} className="px-3 py-2 text-center">
          {v > 0 ? v : "-"}
        </td>
      ))}
      <td className="px-3 py-2 text-center font-medium">{p.c.reduce((a, b) => a + b, 0)}</td>
    </tr>
  );
  return (
    <AppChrome active="History">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Player</th>
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 text-center">
                  {c}
                </th>
              ))}
              <th className="px-3 py-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {HISTORY.map(row)}
            <tr className="bg-slate-100">
              <td
                colSpan={cols.length + 2}
                className="border-y border-slate-300 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                Guest players
              </td>
            </tr>
            {row({ name: "Gia Morales", n: "18", c: [0, 1, 0, 0, 0] })}
          </tbody>
        </table>
      </div>
    </AppChrome>
  );
}

function AdminScreen() {
  return (
    <div className="bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <Logo className="text-lg" />
          <span className="text-xs font-medium text-slate-600">Riverside Lacrosse Club · Admin</span>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Teams</h4>
          <ul className="divide-y divide-slate-100 text-sm">
            {[
              ["Riverside Rockets", "Travel", "#e57200"],
              ["Riverside Rangers", "Rec", "#1ca8db"],
              ["Riverside Flyers", "Travel", "#232d4b"],
            ].map(([n, t, c]) => (
              <li key={n} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c }} aria-hidden />
                  <span className="font-medium text-slate-900">{n}</span>
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Invite a coach</h4>
          <div className="flex gap-2">
            <span className="flex h-8 flex-1 items-center rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-400">
              coach@example.com
            </span>
            <span className="rounded-md bg-brand-orange px-3 py-1.5 text-sm font-medium text-white">Send invite</span>
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Coaches</h4>
          <ul className="divide-y divide-slate-100 text-sm">
            {[
              ["Dana Whitfield", "Club admin", "All teams"],
              ["Sam Okafor", "Coach", "Rockets"],
              ["Priya Nair", "Coach", "Rangers, Flyers"],
            ].map(([n, r, t]) => (
              <li key={n} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium text-slate-900">{n}</span>
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{r}</span>
                </span>
                <span className="text-xs text-slate-500">{t}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export const DEMO_SCREENS: Record<DemoStepId, () => ReactNode> = {
  availability: () => <AvailabilityScreen />,
  lineup: () => <LineupScreen />,
  games: () => <GamesScreen />,
  roster: () => <RosterScreen />,
  guests: () => <GuestsScreen />,
  history: () => <HistoryScreen />,
  admin: () => <AdminScreen />,
};
