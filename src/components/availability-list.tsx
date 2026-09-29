"use client";

import { useRef, useState } from "react";
import { setAvailability } from "@/actions/games";
import { AVAILABILITY_STATUSES } from "@/lib/db/schema";
import { formatGradeExperience } from "@/lib/player-labels";
import { cn } from "@/lib/utils";
import { saveWithRetry } from "@/lib/save-with-retry";
import { SaveStatusIndicator, type SaveStatus } from "@/components/save-status-indicator";

type RosterPlayer = {
  id: string;
  name: string;
  position: string | null;
  status: string;
  grade: string | null;
  experience: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  Available: "bg-emerald-100 text-emerald-800",
  "Not Available": "bg-red-100 text-red-800",
  Maybe: "bg-amber-100 text-amber-800",
  "No Response": "bg-slate-100 text-slate-600",
};

export function AvailabilityList({
  teamId,
  gameId,
  roster,
  canEdit,
}: {
  teamId: string;
  gameId: string;
  roster: RosterPlayer[];
  canEdit: boolean;
}) {
  // Same "fires immediately, needs its own feedback" situation as LineupBoard.assign - see the
  // comment there. Keyed by playerId here instead of slotKey.
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [localValue, setLocalValue] = useState<Record<string, string>>({});
  const attemptSeq = useRef<Record<string, number>>({});

  function update(playerId: string, status: string) {
    setLocalValue((v) => ({ ...v, [playerId]: status }));
    setSaveStatus((s) => ({ ...s, [playerId]: "saving" }));
    const seq = (attemptSeq.current[playerId] ?? 0) + 1;
    attemptSeq.current[playerId] = seq;

    const fd = new FormData();
    fd.set("teamId", teamId);
    fd.set("gameId", gameId);
    fd.set("playerId", playerId);
    fd.set("status", status);

    saveWithRetry(() => setAvailability(fd))
      .then(() => {
        if (attemptSeq.current[playerId] !== seq) return;
        setSaveStatus((s) => ({ ...s, [playerId]: "saved" }));
        window.setTimeout(() => {
          setSaveStatus((s) => (s[playerId] === "saved" ? { ...s, [playerId]: "idle" } : s));
        }, 1500);
      })
      .catch(() => {
        if (attemptSeq.current[playerId] !== seq) return;
        setSaveStatus((s) => ({ ...s, [playerId]: "error" }));
      });
  }

  if (roster.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No active roster players yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {roster.map((p) => {
        const gradeExperience = formatGradeExperience(p.grade, p.experience);
        const status = saveStatus[p.id] ?? "idle";
        // See LineupBoard's displayValue comment - same reasoning, keyed by playerId.
        const displayStatus = status === "idle" ? p.status : (localValue[p.id] ?? p.status);
        return (
        <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <span className="font-medium text-slate-900">{p.name}</span>
            {p.position && <span className="ml-2 text-xs text-slate-500">{p.position}</span>}
            {gradeExperience && <span className="ml-2 text-xs text-slate-500">{gradeExperience}</span>}
          </div>
          {canEdit ? (
            <div className="flex shrink-0 items-center gap-2">
              <select
                value={displayStatus}
                onChange={(e) => update(p.id, e.target.value)}
                className={cn("rounded-full border-0 px-2 py-1 text-xs font-medium", STATUS_STYLES[displayStatus])}
              >
                {AVAILABILITY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <SaveStatusIndicator status={status} onRetry={() => update(p.id, localValue[p.id] ?? p.status)} />
            </div>
          ) : (
            <span className={cn("rounded-full px-2 py-1 text-xs font-medium", STATUS_STYLES[p.status])}>
              {p.status}
            </span>
          )}
        </li>
        );
      })}
    </ul>
  );
}
