"use client";

import { useState, useTransition } from "react";
import { approveWaitingTime, getWaitingTime, type WaitingDay } from "@/actions/parent-approval";
import { formatMinutes } from "@/lib/training-log";

type RosterOption = { id: string; label: string };

type Waiting = { playerLabel: string; days: WaitingDay[]; totalMinutes: number };

function prettyDate(value: string) {
  const d = new Date(`${value}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function ParentApprovalClient({ token, roster }: { token: string; roster: RosterOption[] }) {
  const [playerId, setPlayerId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [done, setDone] = useState<{ label: string; count: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setPlayerId("");
    setPhone("");
    setError("");
    setWaiting(null);
    setDone(null);
  }

  function look(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!playerId) return setError("Pick your child's name.");
    startTransition(async () => {
      try {
        const res = await getWaitingTime(token, playerId, phone);
        if (!res.ok) return setError(res.error);
        setWaiting({ playerLabel: res.playerLabel, days: res.days, totalMinutes: res.totalMinutes });
      } catch {
        setError("Couldn't reach the server - check your signal and try again.");
      }
    });
  }

  function approve() {
    setError("");
    startTransition(async () => {
      try {
        const res = await approveWaitingTime(token, playerId, phone);
        if (!res.ok) return setError(res.error);
        setDone({ label: waiting?.playerLabel ?? "", count: res.count });
        setWaiting(null);
      } catch {
        setError("Couldn't approve - check your signal and try again.");
      }
    });
  }

  if (done) {
    return (
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-center">
        <p className="text-base font-semibold text-green-700">Approved - thank you!</p>
        <p className="text-sm text-slate-600">
          {done.count === 0 ? `Nothing was waiting for ${done.label}.` : `${done.label}'s training time now counts toward the team summary.`}
        </p>
        <button type="button" onClick={reset} className="text-sm font-medium text-brand-blue hover:underline">
          Approve for another child
        </button>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">{waiting.playerLabel}</h2>
          <button type="button" onClick={reset} className="text-sm font-medium text-brand-blue hover:underline">
            Not your child?
          </button>
        </div>
        {waiting.days.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing is waiting for your approval right now.</p>
        ) : (
          <>
            <ul className="space-y-3">
              {waiting.days.map((day) => (
                <li key={day.date}>
                  <p className="text-sm font-medium text-slate-900">
                    {day.weekday}, {prettyDate(day.date)}
                  </p>
                  <ul className="mt-1 divide-y divide-slate-100 rounded-md bg-slate-50 px-3">
                    {day.entries.map((e) => (
                      <li key={e.id} className="flex justify-between gap-3 py-1.5 text-sm">
                        <span className="text-slate-700">
                          {e.kind}
                          {e.note ? <span className="text-slate-400"> - {e.note}</span> : null}
                        </span>
                        <span className="shrink-0 font-medium text-slate-900">{formatMinutes(e.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="text-right text-sm text-slate-600">
              Total: <strong className="text-slate-900">{formatMinutes(waiting.totalMinutes)}</strong>
            </p>
            <p className="text-sm text-slate-600">By approving, you confirm {waiting.playerLabel} did this work outside of practice.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={approve}
              disabled={pending}
              className="w-full rounded-md bg-brand-orange px-4 py-3 text-base font-semibold text-white hover:bg-brand-orange-light disabled:opacity-60"
            >
              {pending ? "Approving…" : "Approve all"}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={look} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <label htmlFor="child" className="text-sm font-medium text-slate-700">
          Your child
        </label>
        <select
          id="child"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
        >
          <option value="">Pick your child&apos;s name…</option>
          {roster.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="parent-phone" className="text-sm font-medium text-slate-700">
          Your mobile number
        </label>
        <input
          id="parent-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
        />
        <p className="mt-1 text-xs text-slate-500">This must be the parent number your child entered in their training log.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-brand-orange px-4 py-2.5 text-base font-semibold text-white hover:bg-brand-orange-light disabled:opacity-60"
      >
        {pending ? "Checking…" : "See what's waiting"}
      </button>
    </form>
  );
}
