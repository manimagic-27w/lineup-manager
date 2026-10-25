"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteLogEntry, listMyEntries, saveLogEntry, type LogEntryDTO } from "@/actions/training-log";
import { TRAINING_KINDS } from "@/lib/db/schema";
import { addDays, formatMinutes, weekStart } from "@/lib/training-log";
import { cn } from "@/lib/utils";

type RosterOption = { id: string; label: string };

const QUICK_MINUTES = [15, 30, 45, 60, 90];
const DAYS_BACK = 13; // today plus the 13 days before it
const STORAGE_KEY = "lm-log-player";

/** Today's date on the player's own phone, as YYYY-MM-DD. */
function localToday() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function prettyDate(value: string) {
  const d = new Date(`${value}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function TrainingLogClient({ token, roster }: { token: string; roster: RosterOption[] }) {
  const [playerId, setPlayerId] = useState("");
  const [today] = useState(localToday);
  const [entries, setEntries] = useState<LogEntryDTO[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState("");
  const [kind, setKind] = useState<string>(TRAINING_KINDS[0]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const dayOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (let i = 0; i <= DAYS_BACK; i++) {
      const value = addDays(today, -i);
      out.push({ value, label: i === 0 ? `Today - ${prettyDate(value)}` : i === 1 ? `Yesterday - ${prettyDate(value)}` : prettyDate(value) });
    }
    return out;
  }, [today]);

  const refresh = useCallback(
    async (id: string) => {
      const res = await listMyEntries(token, id);
      if (res.ok) {
        setEntries(res.entries);
        setLoadError("");
      } else {
        setEntries([]);
        setLoadError(res.error);
      }
    },
    [token],
  );

  // Remember who this phone's player is, as a convenience only (the log itself lives on the server).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(`${STORAGE_KEY}:${token}`);
        if (saved && roster.some((p) => p.id === saved)) {
          setPlayerId(saved);
          void refresh(saved);
        }
      } catch {
        /* storage blocked - the player just picks their name again */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token, roster, refresh]);

  function choosePlayer(id: string) {
    setPlayerId(id);
    setEntries(null);
    setEditingId(null);
    setMessage(null);
    try {
      if (id) window.localStorage.setItem(`${STORAGE_KEY}:${token}`, id);
      else window.localStorage.removeItem(`${STORAGE_KEY}:${token}`);
    } catch {
      /* ignore */
    }
    if (id) void refresh(id);
  }

  function resetForm() {
    setEditingId(null);
    setDate(today);
    setMinutes("");
    setNote("");
  }

  function startEdit(e: LogEntryDTO) {
    setEditingId(e.id);
    setDate(e.logDate);
    setMinutes(String(e.minutes));
    setKind(e.kind);
    setNote(e.note);
    setMessage(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const mins = Number.parseInt(minutes, 10);
    if (!playerId) return setMessage({ kind: "error", text: "Pick your name first." });
    if (!Number.isFinite(mins) || mins < 1) return setMessage({ kind: "error", text: "Enter how many minutes you worked." });
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await saveLogEntry({ token, playerId, entryId: editingId ?? undefined, date, minutes: mins, kind, note });
        if (!res.ok) return setMessage({ kind: "error", text: res.error });
        setMessage({ kind: "ok", text: editingId ? "Entry updated." : "Saved - nice work!" });
        resetForm();
        await refresh(playerId);
      } catch {
        setMessage({ kind: "error", text: "Couldn't save - check your signal and try again." });
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this entry?")) return;
    startTransition(async () => {
      try {
        const res = await deleteLogEntry(token, playerId, id);
        if (!res.ok) return setMessage({ kind: "error", text: res.error });
        if (editingId === id) resetForm();
        await refresh(playerId);
      } catch {
        setMessage({ kind: "error", text: "Couldn't delete - try again." });
      }
    });
  }

  const thisWeek = useMemo(() => {
    const start = weekStart(today);
    return (entries ?? []).filter((e) => e.logDate >= start && e.logDate <= addDays(start, 6)).reduce((sum, e) => sum + e.minutes, 0);
  }, [entries, today]);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <label htmlFor="player" className="text-sm font-medium text-slate-700">
          Who are you?
        </label>
        <select
          id="player"
          value={playerId}
          onChange={(e) => choosePlayer(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
        >
          <option value="">Pick your name…</option>
          {roster.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {playerId && (
        <>
          <form ref={formRef} onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">{editingId ? "Edit entry" : "Add time"}</h2>

            <div>
              <label htmlFor="log-date" className="text-sm font-medium text-slate-700">
                Day
              </label>
              <select
                id="log-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
              >
                {!dayOptions.some((d) => d.value === date) && <option value={date}>{prettyDate(date)}</option>}
                {dayOptions.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-sm font-medium text-slate-700">Type of work</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {TRAINING_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    aria-pressed={kind === k}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium",
                      kind === k ? "border-brand-orange bg-brand-orange text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="log-minutes" className="text-sm font-medium text-slate-700">
                Time spent (minutes)
              </label>
              <div className="mt-1 flex flex-wrap gap-2">
                {QUICK_MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinutes(String(m))}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm font-medium",
                      minutes === String(m) ? "border-brand-blue bg-brand-blue text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
                    )}
                  >
                    {m}
                  </button>
                ))}
                <input
                  id="log-minutes"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  placeholder="Other"
                  className="w-24 rounded-md border border-slate-300 px-3 py-1.5 text-base"
                />
              </div>
            </div>

            <div>
              <label htmlFor="log-note" className="text-sm font-medium text-slate-700">
                Note <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="log-note"
                value={note}
                maxLength={140}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. 100 left-hand throws"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
              />
            </div>

            {message && (
              <p className={cn("text-sm", message.kind === "ok" ? "text-green-700" : "text-red-600")} role="status">
                {message.text}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-md bg-brand-orange px-4 py-2.5 text-base font-semibold text-white hover:bg-brand-orange-light disabled:opacity-60"
              >
                {pending ? "Saving…" : editingId ? "Update entry" : "Save"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setMessage(null);
                  }}
                  className="rounded-md bg-slate-100 px-4 py-2.5 text-base font-medium text-slate-900 hover:bg-slate-200"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-slate-900">Your recent entries</h2>
              <span className="text-sm text-slate-600">This week: <strong className="text-slate-900">{formatMinutes(thisWeek)}</strong></span>
            </div>
            {loadError && <p className="mt-2 text-sm text-red-600">{loadError}</p>}
            {entries === null ? (
              <p className="mt-3 text-sm text-slate-500">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nothing logged in the last 30 days yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {formatMinutes(e.minutes)} &middot; {e.kind}
                      </p>
                      <p className="text-xs text-slate-500">
                        {prettyDate(e.logDate)}
                        {e.note ? ` - ${e.note}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2 text-sm">
                      <button type="button" onClick={() => startEdit(e)} className="font-medium text-brand-blue hover:underline">
                        Edit
                      </button>
                      <button type="button" onClick={() => remove(e.id)} disabled={pending} className="font-medium text-red-600 hover:underline">
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
