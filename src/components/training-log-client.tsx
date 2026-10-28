"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  deleteLogEntry,
  getPlayerAccess,
  listMyEntries,
  saveLogEntry,
  setupPlayerPin,
  updateParentPhone,
  updatePlayerPhone,
  type LogEntryDTO,
} from "@/actions/training-log";
import { TRAINING_KINDS } from "@/lib/db/schema";
import { addDays, formatMinutes, formatPhone, weekStart } from "@/lib/training-log";
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

type Stage = "pick" | "checking" | "setup" | "pin" | "open";

export function TrainingLogClient({
  token,
  roster,
  requireApproval = true,
}: {
  token: string;
  roster: RosterOption[];
  /** Whether this team has parents approve logged time (otherwise no phone numbers are needed). */
  requireApproval?: boolean;
}) {
  const [needsApproval, setNeedsApproval] = useState(requireApproval);
  const [playerId, setPlayerId] = useState("");
  const [stage, setStage] = useState<Stage>("pick");
  const [hasParentPhone, setHasParentPhone] = useState(false);
  const [hasPlayerPhone, setHasPlayerPhone] = useState(false);
  const [pin, setPin] = useState(""); // held only in memory for this visit; never stored on the phone
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [phoneInput, setPhoneInput] = useState(""); // parent number
  const [ownPhoneInput, setOwnPhoneInput] = useState(""); // the player's own number
  const [playerPhone, setPlayerPhone] = useState<string | null>(null);
  const [gateError, setGateError] = useState("");
  const [parentPhone, setParentPhone] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
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

  /** Loads the player's entries with their PIN. Returns false (and shows why) if the PIN is refused. */
  const unlock = useCallback(
    async (id: string, thePin: string) => {
      const res = await listMyEntries(token, id, thePin);
      if (!res.ok) {
        setGateError(res.error);
        return false;
      }
      setEntries(res.entries);
      setParentPhone(res.parentPhone);
      setPlayerPhone(res.playerPhone);
      setNeedsApproval(res.requireApproval);
      setLoadError("");
      setPin(thePin);
      setStage("open");
      setGateError("");
      return true;
    },
    [token],
  );

  /** Reloads the list after a change (the PIN is already known). */
  const refresh = useCallback(
    async (id: string, thePin: string) => {
      const res = await listMyEntries(token, id, thePin);
      if (res.ok) {
        setEntries(res.entries);
        setParentPhone(res.parentPhone);
        setPlayerPhone(res.playerPhone);
        setNeedsApproval(res.requireApproval);
        setLoadError("");
      } else {
        setLoadError(res.error);
      }
    },
    [token],
  );

  const openPlayer = useCallback(
    async (id: string) => {
      setStage("checking");
      setGateError("");
      try {
        const res = await getPlayerAccess(token, id);
        if (!res.ok) {
          setGateError(res.error);
          setStage("pick");
          return;
        }
        setHasParentPhone(res.hasParentPhone);
        setHasPlayerPhone(res.hasPlayerPhone);
        setNeedsApproval(res.requireApproval);
        setStage(res.hasPin ? "pin" : "setup");
      } catch {
        setGateError("Couldn't reach the server - check your signal and try again.");
        setStage("pick");
      }
    },
    [token],
  );

  // Remember which player this phone last used, as a convenience only. The PIN is never remembered,
  // so the log works the same from any phone or computer.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(`${STORAGE_KEY}:${token}`);
        if (saved && roster.some((p) => p.id === saved)) {
          setPlayerId(saved);
          void openPlayer(saved);
        }
      } catch {
        /* storage blocked - the player just picks their name again */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token, roster, openPlayer]);

  function choosePlayer(id: string) {
    setPlayerId(id);
    setEntries(null);
    setEditingId(null);
    setMessage(null);
    setPin("");
    setPinInput("");
    setPinConfirm("");
    setPhoneInput("");
    setOwnPhoneInput("");
    setGateError("");
    setEditingPhone(false);
    setStage("pick");
    try {
      if (id) window.localStorage.setItem(`${STORAGE_KEY}:${token}`, id);
      else window.localStorage.removeItem(`${STORAGE_KEY}:${token}`);
    } catch {
      /* ignore */
    }
    if (id) void openPlayer(id);
  }

  function submitSetup(ev: React.FormEvent) {
    ev.preventDefault();
    setGateError("");
    if (!/^\d{4}$/.test(pinInput)) return setGateError("Your PIN must be exactly 4 numbers.");
    if (pinInput !== pinConfirm) return setGateError("The two PINs don't match.");
    startTransition(async () => {
      try {
        const res = await setupPlayerPin({ token, playerId, pin: pinInput, playerPhone: ownPhoneInput, parentPhone: phoneInput });
        if (!res.ok) return setGateError(res.error);
        await unlock(playerId, pinInput);
      } catch {
        setGateError("Couldn't save - check your signal and try again.");
      }
    });
  }

  function submitPin(ev: React.FormEvent) {
    ev.preventDefault();
    setGateError("");
    if (!/^\d{4}$/.test(pinInput)) return setGateError("Enter your 4-number PIN.");
    startTransition(async () => {
      try {
        const ok = await unlock(playerId, pinInput);
        if (!ok) setPinInput("");
      } catch {
        setGateError("Couldn't reach the server - try again.");
      }
    });
  }

  function lock() {
    setPin("");
    setPinInput("");
    setEntries(null);
    setEditingId(null);
    setMessage(null);
    setStage("pin");
  }

  /** Saves whichever of the two numbers was typed (used by "Change numbers" and the one-time prompt). */
  function savePhones(ev: React.FormEvent) {
    ev.preventDefault();
    startTransition(async () => {
      try {
        if (ownPhoneInput.trim()) {
          const res = await updatePlayerPhone(token, playerId, pin, ownPhoneInput);
          if (!res.ok) return setMessage({ kind: "error", text: res.error });
          setPlayerPhone(res.playerPhone);
        }
        if (phoneInput.trim()) {
          const res = await updateParentPhone(token, playerId, pin, phoneInput);
          if (!res.ok) return setMessage({ kind: "error", text: res.error });
          setParentPhone(res.parentPhone);
        }
        setEditingPhone(false);
        setPhoneInput("");
        setOwnPhoneInput("");
        setMessage({ kind: "ok", text: "Numbers updated." });
      } catch {
        setMessage({ kind: "error", text: "Couldn't save - try again." });
      }
    });
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
        const res = await saveLogEntry({ token, playerId, pin, entryId: editingId ?? undefined, date, minutes: mins, kind, note });
        if (!res.ok) return setMessage({ kind: "error", text: res.error });
        setMessage({ kind: "ok", text: editingId ? "Entry updated." : "Saved - nice work!" });
        resetForm();
        await refresh(playerId, pin);
      } catch {
        setMessage({ kind: "error", text: "Couldn't save - check your signal and try again." });
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this entry?")) return;
    startTransition(async () => {
      try {
        const res = await deleteLogEntry(token, playerId, pin, id);
        if (!res.ok) return setMessage({ kind: "error", text: res.error });
        if (editingId === id) resetForm();
        await refresh(playerId, pin);
      } catch {
        setMessage({ kind: "error", text: "Couldn't delete - try again." });
      }
    });
  }

  const thisWeek = useMemo(() => {
    const start = weekStart(today);
    return (entries ?? []).filter((e) => e.logDate >= start && e.logDate <= addDays(start, 6)).reduce((sum, e) => sum + e.minutes, 0);
  }, [entries, today]);

  const playerLabel = roster.find((r) => r.id === playerId)?.label ?? "";

  /** Days that still have time waiting on a parent, newest first. */
  const waitingDays = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const e of entries ?? []) if (!e.approved) byDay.set(e.logDate, (byDay.get(e.logDate) ?? 0) + e.minutes);
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entries]);

  const inputCls = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base";
  const pinCls = "mt-1 w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-center text-xl tracking-[0.4em]";

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
        {stage === "open" && (
          <button type="button" onClick={lock} className="mt-2 text-sm font-medium text-brand-blue hover:underline">
            Lock my log
          </button>
        )}
      </div>

      {gateError && stage === "pick" && <p className="text-sm text-red-600">{gateError}</p>}
      {playerId && stage === "checking" && <p className="text-sm text-slate-500">One moment…</p>}

      {playerId && stage === "setup" && (
        <form onSubmit={submitSetup} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">First time here? Set your PIN</h2>
          <p className="text-sm text-slate-600">
            Pick a 4-number PIN. You&apos;ll use it each time you open your log, so nobody else can add time under your name. Don&apos;t use a PIN you
            use anywhere else.
          </p>
          <div className="flex gap-4">
            <div>
              <label htmlFor="new-pin" className="text-sm font-medium text-slate-700">
                New PIN
              </label>
              <input
                id="new-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={pinCls}
              />
            </div>
            <div>
              <label htmlFor="confirm-pin" className="text-sm font-medium text-slate-700">
                Type it again
              </label>
              <input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={pinCls}
              />
            </div>
          </div>
          {needsApproval && !hasPlayerPhone && (
            <div>
              <label htmlFor="own-phone" className="text-sm font-medium text-slate-700">
                Your mobile number
              </label>
              <input
                id="own-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={ownPhoneInput}
                onChange={(e) => setOwnPhoneInput(e.target.value)}
                placeholder="(555) 123-4567"
                className={inputCls}
              />
            </div>
          )}
          {needsApproval && !hasParentPhone && (
            <div>
              <label htmlFor="parent-phone" className="text-sm font-medium text-slate-700">
                Parent&apos;s mobile number
              </label>
              <input
                id="parent-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="(555) 123-4567"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-500">
                Your parent approves your time on the parent link by typing this number, so it must be a different phone from yours.
              </p>
            </div>
          )}
          {gateError && <p className="text-sm text-red-600">{gateError}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-brand-orange px-4 py-2.5 text-base font-semibold text-white hover:bg-brand-orange-light disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save PIN and continue"}
          </button>
        </form>
      )}

      {playerId && stage === "pin" && (
        <form onSubmit={submitPin} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <label htmlFor="enter-pin" className="text-base font-semibold text-slate-900">
            Enter your PIN
          </label>
          <div>
            <input
              id="enter-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className={pinCls}
            />
          </div>
          {gateError && <p className="text-sm text-red-600">{gateError}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-brand-orange px-4 py-2.5 text-base font-semibold text-white hover:bg-brand-orange-light disabled:opacity-60"
          >
            {pending ? "Checking…" : "Open my log"}
          </button>
          <p className="text-xs text-slate-500">Forgot your PIN? Ask your coach to reset it.</p>
        </form>
      )}

      {playerId && stage === "open" && needsApproval && !playerPhone && (
        <form onSubmit={savePhones} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">One more thing: your mobile number</h2>
          <p className="text-sm text-slate-600">Add your own mobile number. It has to be different from your parent&apos;s number.</p>
          <input
            type="tel"
            inputMode="tel"
            aria-label="Your mobile number"
            value={ownPhoneInput}
            onChange={(e) => setOwnPhoneInput(e.target.value)}
            placeholder="(555) 123-4567"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          />
          {!parentPhone && (
            <input
              type="tel"
              inputMode="tel"
              aria-label="Parent's mobile number"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="Parent's mobile number"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
            />
          )}
          {message && <p className={cn("text-sm", message.kind === "ok" ? "text-green-700" : "text-red-600")}>{message.text}</p>}
          <button type="submit" disabled={pending} className="w-full rounded-md bg-brand-orange px-4 py-2.5 text-base font-semibold text-white disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      )}

      {playerId && stage === "open" && (!needsApproval || !!playerPhone) && (
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

          {needsApproval && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Parent approval</h2>
              <button type="button" onClick={() => { setEditingPhone((v) => !v); setPhoneInput(""); setOwnPhoneInput(""); }} className="text-sm font-medium text-brand-blue hover:underline">
                {editingPhone ? "Cancel" : "Change numbers"}
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Your coach counts time once a parent approves it. Parent&apos;s phone:{" "}
              <strong className="text-slate-900">{parentPhone ? formatPhone(parentPhone) : "not set"}</strong>
              <br />
              Your phone: <strong className="text-slate-900">{playerPhone ? formatPhone(playerPhone) : "not set"}</strong>
            </p>
            {editingPhone && (
              <form onSubmit={savePhones} className="mt-2 space-y-2">
                <input
                  type="tel"
                  inputMode="tel"
                  aria-label="Your mobile number"
                  value={ownPhoneInput}
                  onChange={(e) => setOwnPhoneInput(e.target.value)}
                  placeholder="Your number (leave blank to keep)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
                />
                <input
                  type="tel"
                  inputMode="tel"
                  aria-label="Parent's mobile number"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="Parent's number (leave blank to keep)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
                />
                <button type="submit" disabled={pending} className="rounded-md bg-brand-blue px-4 py-2 text-base font-semibold text-white disabled:opacity-60">
                  Save
                </button>
              </form>
            )}
            {entries === null ? null : waitingDays.length === 0 ? (
              <p className="mt-3 text-sm text-green-700">Nothing waiting - all your time is approved.</p>
            ) : (
              <>
                <ul className="mt-3 space-y-2">
                  {waitingDays.map(([day, mins]) => (
                    <li key={day} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-slate-800">
                      {prettyDate(day)} &middot; <strong>{formatMinutes(mins)}</strong> waiting
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  Ask your parent to open the <strong>parent link</strong> your coach shared, pick your name and approve. Once they do, this time counts.
                </p>
              </>
            )}
          </div>
          )}

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
                        {formatMinutes(e.minutes)} &middot; {e.kind}{" "}
                        {needsApproval && (
                          <span
                            className={cn(
                              "ml-1 rounded-full px-2 py-0.5 text-xs font-medium",
                              e.approved ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800",
                            )}
                          >
                            {e.approved ? "Approved" : "Waiting"}
                          </span>
                        )}
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
