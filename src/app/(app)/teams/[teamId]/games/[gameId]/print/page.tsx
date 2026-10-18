import { notFound } from "next/navigation";
import { getGame, getGameDay } from "@/actions/games";
import { requireTeamAccess } from "@/lib/auth";
import { getBenchPlayers } from "@/lib/lineup";
import { PrintButton } from "@/components/print-button";

const UNIT_ORDER_BY_FORMAT: Record<string, string[]> = {
  field: ["Attack", "Midfield", "Defense", "Goalie"],
  sixes: ["Sixes", "Goalie"],
  sevens: ["Attack", "Midfield", "Defense", "Goalie"],
};

/**
 * A clean, print-only view of one game's lineup + bench (positions down the left, a lined notes area on the right) - a separate route (rather than print
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

  const { roster, slots } = await getGameDay(teamId, gameId, game.format, game.subs);
  // Guests are tagged so the printed sheet shows who is not on the core roster.
  const activeRoster = roster
    .filter((p) => !p.archivedAt)
    .map((p) => (p.isGuest ? { ...p, name: `${p.name} (guest)` } : p));
  const playerById = new Map(activeRoster.map((p) => [p.id, p]));
  const bench = getBenchPlayers(activeRoster, slots);
  const unitOrder = UNIT_ORDER_BY_FORMAT[game.format] ?? UNIT_ORDER_BY_FORMAT.field;

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
      </header>

      {/* Positions run down the left, top to bottom (Attack, Midfield, Defense, Goalie), then the
          bench; the right half is one big lined notes area that runs the full height. */}
      <div className="flex items-stretch gap-6 print:gap-5">
        <div className="w-1/2 space-y-4">
          {unitOrder.map((unit) => (
            <section key={unit}>
              <h2 className="mb-1 border-b border-slate-300 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-700">
                {unit}
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  {slots
                    .filter((s) => s.unit === unit)
                    .map((slot, i, unitSlots) => {
                      const player = slot.playerId
                        ? playerById.get(slot.playerId)
                        : undefined;
                      // Subs follow the starters, set off by a heavier rule above the first one.
                      const firstSub = !!slot.sub && !unitSlots[i - 1]?.sub;
                      return (
                        <tr
                          key={slot.key}
                          className={firstSub ? "border-t-2 border-t-slate-300 border-b border-b-slate-100" : "border-b border-slate-100"}
                        >
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
            </section>
          ))}

          <section>
            <h2 className="mb-1 border-b border-slate-300 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-700">
              Bench
            </h2>
            {bench.length === 0 ? (
              <p className="text-sm text-slate-500">No bench players.</p>
            ) : (
              <ul className="space-y-0.5 text-sm">
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

        <section className="flex min-h-[600px] w-1/2 flex-col rounded border border-slate-300 print:min-h-[8.5in]">
          <h2 className="border-b border-slate-300 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Notes
          </h2>
          {/* Ruled lines: a repeating background, forced to print, so the whole area is lined
              however tall it ends up. Any notes saved on the game are written on the first lines. */}
          <div
            className="flex-1 px-3 text-sm leading-[28px] text-slate-900 [-webkit-print-color-adjust:exact] [print-color-adjust:exact]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #94a3b8 27px, #94a3b8 28px)",
            }}
          >
            {game.notes && <p className="whitespace-pre-line">{game.notes}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
