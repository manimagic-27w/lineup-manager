import { enableStatsForTeam } from "@/actions/teams";
import { SubmitButton } from "@/components/submit-button";

/** Shown on every Stats page until the team has turned stats tracking on. */
export function StatsEnable({ teamId }: { teamId: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 text-center sm:px-6">
      <h1 className="text-xl font-semibold text-slate-900">Track stats for this team</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Turn on a stats sheet with the basics - Goals, Assists, Shots, Ground Balls, Draw Controls, Caused Turnovers, Turnovers, Saves, Goals Allowed and
        Forced Turnovers - one column per game, automatically blacked out for players who were unavailable. You can add your own categories afterward.
      </p>
      <form action={enableStatsForTeam} className="mt-6 inline-block">
        <input type="hidden" name="teamId" value={teamId} />
        <SubmitButton pendingLabel="Enabling…">Enable stats tracking</SubmitButton>
      </form>
    </div>
  );
}
