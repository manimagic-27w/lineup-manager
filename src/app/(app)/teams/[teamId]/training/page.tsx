import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { players, TRAINING_KINDS } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { listTeamLog, listTeamProfiles } from "@/actions/training-log";
import { ResetPinButton } from "@/components/reset-pin-button";
import { getAppUrl } from "@/lib/app-url";
import { TrainingLogLink } from "@/components/training-log-link";
import {
  formatMinutes,
  lastFour,
  parseRange,
  rangeStart,
  SUMMARY_RANGES,
  SUMMARY_TIME_ZONE,
  summarizeByPlayer,
  todayIn,
  weekdayName,
} from "@/lib/training-log";
import { cn } from "@/lib/utils";

function shortDate(value: string) {
  const d = new Date(`${value}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function TrainingPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { teamId } = await params;
  const sp = await searchParams;
  const { team } = await requireTeamAccess(teamId);

  const range = parseRange(sp.range);
  const today = todayIn(SUMMARY_TIME_ZONE);
  const since = rangeStart(range, today);

  const [roster, entries, profiles] = await Promise.all([
    db
      .select({ id: players.id, name: players.name, archivedAt: players.archivedAt })
      .from(players)
      .where(and(eq(players.teamId, teamId), eq(players.isGuest, false))),
    listTeamLog(teamId, since),
    listTeamProfiles(teamId),
  ]);
  const profileByPlayer = new Map(profiles.map((pr) => [pr.playerId, pr]));
  const active = roster.filter((p) => !p.archivedAt);
  // Include an archived player only if they have time logged in this range.
  const loggedIds = new Set(entries.map((e) => e.playerId));
  const shown = [...active, ...roster.filter((p) => p.archivedAt && loggedIds.has(p.id))];

  const summary = summarizeByPlayer(
    shown.map((p) => p.id),
    entries.map((e) => ({ playerId: e.playerId, logDate: e.logDate, minutes: e.minutes, kind: e.kind, approved: !!e.approvedAt })),
  );
  const rows = shown
    .map((p) => ({ p, s: summary.get(p.id)! }))
    .sort((a, b) => b.s.totalMinutes - a.s.totalMinutes || a.p.name.localeCompare(b.p.name));
  const logged = rows.filter((r) => r.s.totalMinutes > 0).length;
  const teamTotal = rows.reduce((sum, r) => sum + r.s.totalMinutes, 0);
  const pendingTotal = rows.reduce((sum, r) => sum + r.s.pendingMinutes, 0);
  const entriesByPlayer = new Map<string, typeof entries>();
  for (const e of entries) entriesByPlayer.set(e.playerId, [...(entriesByPlayer.get(e.playerId) ?? []), e]);

  const url = team.trainingLogToken ? `${getAppUrl()}/log/${team.trainingLogToken}` : null;
  const parentUrl = team.parentApprovalToken ? `${getAppUrl()}/parents/${team.parentApprovalToken}` : null;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Training outside of practice</h2>
        <p className="mt-1 text-sm text-slate-600">
          Time your players log for wall ball, shooting, dodging and private training.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TrainingLogLink teamId={teamId} url={url} />
        <TrainingLogLink teamId={teamId} url={parentUrl} kind="parents" />
      </div>

      <div className="flex flex-wrap gap-2">
        {SUMMARY_RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/teams/${teamId}/training?range=${r.key}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              range === r.key ? "border-brand-orange bg-brand-orange text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-2xl font-semibold text-slate-900">{formatMinutes(teamTotal)}</p>
          <p className="text-xs text-slate-500">Team total (approved)</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-2xl font-semibold text-slate-900">
            {logged}
            <span className="text-base font-normal text-slate-400"> of {active.length}</span>
          </p>
          <p className="text-xs text-slate-500">Players with approved time</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-2xl font-semibold text-slate-900">{logged > 0 ? formatMinutes(Math.round(teamTotal / logged)) : "-"}</p>
          <p className="text-xs text-slate-500">Average per player who logged</p>
        </div>
      </div>

      {pendingTotal > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>{formatMinutes(pendingTotal)}</strong> more is logged but still waiting on a parent&apos;s approval. It isn&apos;t counted above yet.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Add players on the Roster tab to see their training time here.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {rows.map(({ p, s }) => {
            const list = entriesByPlayer.get(p.id) ?? [];
            return (
              <li key={p.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className={cn("truncate text-sm font-medium", s.totalMinutes === 0 ? "text-slate-400" : "text-slate-900")}>
                        {p.name}
                        {p.archivedAt ? <span className="ml-2 text-xs font-normal text-slate-400">(archived)</span> : null}
                      </p>
                      {s.pendingMinutes > 0 && <p className="mt-0.5 text-xs text-amber-700">{formatMinutes(s.pendingMinutes)} waiting for parent approval</p>}
                      {s.totalMinutes > 0 && (
                        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                          {TRAINING_KINDS.filter((k) => s.byKind[k]).map((k) => (
                            <span key={k}>
                              {k} {formatMinutes(s.byKind[k])}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("text-base font-semibold", s.totalMinutes === 0 ? "text-slate-300" : "text-slate-900")}>{formatMinutes(s.totalMinutes)}</p>
                      <p className="text-xs text-slate-500">
                        {s.sessions === 0 ? (s.pendingMinutes > 0 ? "nothing approved yet" : "nothing logged") : `${s.sessions} session${s.sessions === 1 ? "" : "s"} · last ${shortDate(s.lastLogged!)}`}
                      </p>
                    </div>
                  </summary>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                    <span>
                      PIN: {profileByPlayer.get(p.id)?.hasPin ? "set" : "not set yet"} &middot; Player phone:{" "}
                      {profileByPlayer.get(p.id)?.playerPhone ? `ending ${lastFour(profileByPlayer.get(p.id)!.playerPhone!)}` : "not entered"} &middot; Parent phone:{" "}
                      {profileByPlayer.get(p.id)?.parentPhone ? `ending ${lastFour(profileByPlayer.get(p.id)!.parentPhone!)}` : "not entered"}
                    </span>
                    {profileByPlayer.get(p.id)?.hasPin && <ResetPinButton teamId={teamId} playerId={p.id} playerName={p.name} />}
                  </div>
                  {list.length > 0 && (
                    <ul className="space-y-1 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                      {list.map((e) => (
                        <li key={e.id} className="flex flex-wrap justify-between gap-x-3">
                          <span className="text-slate-700">
                            {weekdayName(e.logDate).slice(0, 3)} {shortDate(e.logDate)} &middot; {e.kind}
                            {e.note ? <span className="text-slate-400"> - {e.note}</span> : null}
                          </span>
                          <span className="font-medium text-slate-900">
                            {formatMinutes(e.minutes)}
                            {!e.approvedAt && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Waiting</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
