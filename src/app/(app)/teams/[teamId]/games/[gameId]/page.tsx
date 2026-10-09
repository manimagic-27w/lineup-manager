import { notFound } from "next/navigation";
import { getGame, getGameDay, updateGame, deleteGame, setGameResult } from "@/actions/games";
import { listSeasons } from "@/actions/seasons";
import { requireTeamAccess } from "@/lib/auth";
import { ensureHttpUrl } from "@/lib/utils";
import { gameOutcome } from "@/lib/game-record";
import { AvailabilityList } from "@/components/availability-list";
import { LineupBoard } from "@/components/lineup-board";
import { PrintLineupButton } from "@/components/print-lineup-button";
import { SubmitButton } from "@/components/submit-button";
import { TeamRealtime } from "@/components/team-realtime";
import { GameDayCacheWriter } from "@/components/game-day-cache-writer";
import { OfflineBanner } from "@/components/offline-banner";

export default async function GameDayPage({
  params,
}: {
  params: Promise<{ teamId: string; gameId: string }>;
}) {
  const { teamId, gameId } = await params;
  await requireTeamAccess(teamId);

  const game = await getGame(teamId, gameId);
  if (!game) notFound();

  const [{ roster, slots }, seasons] = await Promise.all([
    getGameDay(teamId, gameId, game.format),
    listSeasons(teamId),
  ]);
  const activeRoster = roster.filter((p) => !p.archivedAt);
  const outcome = gameOutcome(game);
  const OUTCOME_STYLES = {
    W: "bg-green-100 text-green-800",
    L: "bg-red-100 text-red-800",
    T: "bg-slate-200 text-slate-700",
  } as const;
  const seasonName = game.seasonId ? (seasons.find((s) => s.id === game.seasonId)?.name ?? null) : null;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["availability", "lineup", "games"]} />
      <GameDayCacheWriter
        teamId={teamId}
        gameId={gameId}
        date={game.date}
        opponent={game.opponent}
        seasonName={seasonName}
        format={game.format}
        roster={activeRoster.map((p) => ({
          id: p.id,
          name: p.name,
          number: p.number,
          grade: p.grade,
          experience: p.experience,
          position: p.position,
          status: p.status,
        }))}
        slots={slots}
      />
      <OfflineBanner gameId={gameId} />

      <section className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Final score</span>
          {outcome ? (
            <div className="flex items-center gap-2">
              <span className={`rounded-md px-2 py-1 text-sm font-bold ${OUTCOME_STYLES[outcome]}`}>{outcome}</span>
              <span className="text-2xl font-bold tabular-nums text-slate-900">
                {game.ourScore}&ndash;{game.opponentScore}
              </span>
              {game.isFriendly && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  Friendly &middot; not in record
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-slate-500">
              Not entered yet{game.isFriendly ? " (friendly)" : ""}
            </span>
          )}
        </div>
        <form action={setGameResult} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="gameId" value={gameId} />
          <div className="flex flex-col gap-1">
            <label htmlFor="our-score" className="text-xs font-medium text-slate-600">
              Our score
            </label>
            <input
              id="our-score"
              type="number"
              name="ourScore"
              min={0}
              max={999}
              inputMode="numeric"
              defaultValue={game.ourScore ?? ""}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="opp-score" className="text-xs font-medium text-slate-600">
              {game.opponent ? `${game.opponent} score` : "Opponent score"}
            </label>
            <input
              id="opp-score"
              type="number"
              name="opponentScore"
              min={0}
              max={999}
              inputMode="numeric"
              defaultValue={game.opponentScore ?? ""}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" name="isFriendly" defaultChecked={game.isFriendly} className="h-4 w-4" />
            Friendly (doesn&rsquo;t count toward record)
          </label>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save score
          </SubmitButton>
        </form>
      </section>

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
          {seasons.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Season</label>
              <select
                name="seasonId"
                defaultValue={game.seasonId ?? ""}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">No season</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Format</label>
            <select
              name="format"
              defaultValue={game.format}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="field">Field (12 starters)</option>
              <option value="sevens">Sevens (8 a side)</option>
              <option value="sixes">Sixes (6 a side)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Game film link</label>
            <input
              name="filmUrl"
              defaultValue={game.filmUrl ?? ""}
              placeholder="https://…"
              className="w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <input type="hidden" name="notes" value={game.notes} />
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </form>
        {game.filmUrl && (
          <a
            href={ensureHttpUrl(game.filmUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-brand-blue hover:bg-slate-200"
          >
            Watch film ↗
          </a>
        )}
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
          <LineupBoard teamId={teamId} gameId={gameId} format={game.format} slots={slots} roster={activeRoster} canEdit />

          <form action={updateGame} className="mt-4">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="gameId" value={gameId} />
            <input type="hidden" name="date" value={game.date} />
            <input type="hidden" name="opponent" value={game.opponent ?? ""} />
            <input type="hidden" name="seasonId" value={game.seasonId ?? ""} />
            <input type="hidden" name="format" value={game.format} />
            <input type="hidden" name="filmUrl" value={game.filmUrl ?? ""} />
            <label htmlFor="game-notes" className="mb-1 block text-xs font-medium text-slate-600">
              Notes
            </label>
            <textarea
              id="game-notes"
              name="notes"
              defaultValue={game.notes}
              rows={3}
              placeholder="Reminders for game day - subs every quarter, watch their fast break, etc. Shows up on the printed lineup sheet too."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-2">
              <SubmitButton variant="secondary" pendingLabel="Saving…">
                Save notes
              </SubmitButton>
            </div>
          </form>
        </section>

        <section className="lg:sticky lg:top-6">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Availability</h2>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <AvailabilityList teamId={teamId} gameId={gameId} roster={activeRoster} format={game.format} canEdit />
          </div>
        </section>
      </div>
    </div>
  );
}
