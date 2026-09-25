import { notFound } from "next/navigation";
import { getGame, getGameDay, updateGame, deleteGame } from "@/actions/games";
import { requireTeamAccess } from "@/lib/auth";
import { AvailabilityList } from "@/components/availability-list";
import { LineupBoard } from "@/components/lineup-board";
import { PrintLineupButton } from "@/components/print-lineup-button";
import { SubmitButton } from "@/components/submit-button";
import { TeamRealtime } from "@/components/team-realtime";

export default async function GameDayPage({
  params,
}: {
  params: Promise<{ teamId: string; gameId: string }>;
}) {
  const { teamId, gameId } = await params;
  await requireTeamAccess(teamId);

  const game = await getGame(teamId, gameId);
  if (!game) notFound();

  const { roster, slots } = await getGameDay(teamId, gameId);
  const activeRoster = roster.filter((p) => !p.archivedAt);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["availability", "lineup"]} />

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <form action={updateGame} className="flex flex-1 flex-wrap items-end gap-3">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="gameId" value={gameId} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Date</label>
            <input
              type="date"
              name="date"
              defaultValue={game.date}
              required
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Opponent</label>
            <input
              name="opponent"
              defaultValue={game.opponent ?? ""}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Notes</label>
            <input
              name="notes"
              defaultValue={game.notes}
              className="w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </form>
        <PrintLineupButton href={`/teams/${teamId}/games/${gameId}/print`} />
        <form action={deleteGame}>
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="gameId" value={gameId} />
          <SubmitButton variant="danger" pendingLabel="Deleting…">
            Delete game
          </SubmitButton>
        </form>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-start">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Lineup</h2>
          <LineupBoard teamId={teamId} gameId={gameId} slots={slots} roster={activeRoster} canEdit />
        </section>

        <section className="lg:sticky lg:top-6">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Availability</h2>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <AvailabilityList teamId={teamId} gameId={gameId} roster={activeRoster} canEdit />
          </div>
        </section>
      </div>
    </div>
  );
}
