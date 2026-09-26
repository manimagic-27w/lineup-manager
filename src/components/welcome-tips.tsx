import Link from "next/link";

const TIPS = [
  "Every team has five tabs: Roster, Games, Stats, Activity, and Settings - Roster and Games are where you'll spend most of your time.",
  "On each game's page, set every player's availability (Available, Maybe, Not Available) before you build the lineup - the lineup dropdowns only offer Available or Maybe players.",
  "A Maybe player placed in the lineup is highlighted yellow; a starter whose availability changes to Not Available or No Response turns red so you notice and can swap them out.",
  "Anyone not in a starting slot shows up automatically on the Bench below the lineup - no extra step needed.",
  "Use “Print lineup sheet” on the game page to print or save a PDF of the lineup and bench for game day.",
  "Importing a roster CSV? Use columns name,number,position,grade,experience - re-importing updates existing players by name instead of creating duplicates.",
];

export function WelcomeTips() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-slate-900">Welcome to Lineup Manager</h2>
      <p className="mt-1 text-sm text-slate-600">A few things worth knowing before your first game:</p>

      <ul className="mt-4 space-y-2">
        {TIPS.map((tip) => (
          <li key={tip} className="flex gap-2 text-sm text-slate-700">
            <span className="mt-0.5 text-slate-400">•</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
        <Link
          href="/guides/quick-start-guide.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Quick start guide (PDF)
        </Link>
        <Link
          href="/guides/new-coach-guide.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200"
        >
          Full coach guide (PDF)
        </Link>
      </div>
    </div>
  );
}
