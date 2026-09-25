import { notFound } from "next/navigation";
import { getGame, getGameDay } from "@/actions/games";
import { requireTeamAccess } from "@/lib/auth";
import { getBenchPlayers } from "@/lib/lineup";
import { PrintButton } from "@/components/print-button";

const UNIT_ORDER = ["Attack", "Midfield", "Defense", "Goalie"];

/**
 * A clean, print-only view of one game's lineup + bench - a separate route (rather than print
 * CSS layered over the interactive game page) so the dropdowns, availability list and app chrome
 * never have to be reasoned about as print output. The app header/nav hide themselves on print
 * (see the app and team layouts), so this page's own content is all that reaches paper.
 */
export default async function LineupPrintPage({
  params,
}: {
  params: Promise<{ teamId: string; gameId: string }>;
}) {
  const { teamId, gameId } = await params;
  const { team } = await requireTeamAccess(teamId);

  const game = await getGame(teamId, gameId);
  if (!game) notFound();

  const { roster, slots } = await getGameDay(teamId, gameId);
  const activeRoster = roster.filter((p) => !p.archivedAt);
  const playerById = new Map(activeRoster.map((p) => [p.id, p]));
  const bench = getBenchPlayers(activeRoster, slots);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6 print:max-w-none print:space-y-4 print:px-0 print:py-0">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <p className="text-sm text-slate-500">
          Use the button below, or your browser&apos;s own print command, to
          print this sheet or save it as a PDF.
        </p>
        <PrintButton />
      </div>

      <header className="space-y-1 border-b border-slate-300 pb-3">
        <h1 className="text-2xl font-bold text-slate-900">{team.name}</h1>
        <p className="text-sm text-slate-600">
          {game.date}
          {game.opponent ? ` vs ${game.opponent}` : ""}
        </p>
        {game.notes && <p className="text-sm text-slate-500">{game.notes}</p>}
      </header>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-4">
        {UNIT_ORDER.map((unit) => (
          <div key={unit}>
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-700">
              {unit}
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {slots
                  .filter((s) => s.unit === unit)
                  .map((slot) => {
                    const player = slot.playerId
                      ? playerById.get(slot.playerId)
                      : undefined;
                    return (
                      <tr key={slot.key} className="border-b border-slate-100">
                        <td className="w-28 py-1 pr-2 align-top text-slate-500">
                          {slot.label}
                        </td>
                        <td className="py-1 font-medium text-slate-900">
                          {player
                            ? `${player.name}${player.number ? ` #${player.number}` : ""}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 border-b border-slate-300 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-700">
          Bench
        </h2>
        {bench.length === 0 ? (
          <p className="text-sm text-slate-500">No bench players.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 print:grid-cols-3">
            {bench.map((p) => (
              <li key={p.id} className="text-slate-900">
                {p.name}
                {p.number ? ` #${p.number}` : ""}
                {p.position ? ` (${p.position[0]})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
