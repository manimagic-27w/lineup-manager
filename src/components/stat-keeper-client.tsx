"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getKeeperGame,
  recordKeeperAction,
  undoKeeperAction,
  unlockKeeper,
  type KeeperEvent,
  type KeeperGameOption,
  type KeeperPlayer,
} from "@/actions/stat-keeper";
import { KEEPER_ACTIONS, type KeeperActionKey, type KeeperGroup } from "@/lib/stat-keeper";
import { cn } from "@/lib/utils";

type LocalEvent = KeeperEvent & { state: "saved" | "sending" };
type QueueItem = { id: string; gameId: string; playerId: string; action: KeeperActionKey; kind: string; pin: string };

const GROUP_STYLE: Record<KeeperGroup, { idle: string; chosen: string }> = {
  offense: { idle: "border-green-300 bg-green-50 text-green-900", chosen: "border-green-700 bg-green-600 text-white" },
  possession: { idle: "border-blue-300 bg-blue-50 text-blue-900", chosen: "border-blue-700 bg-blue-600 text-white" },
  defense: { idle: "border-amber-300 bg-amber-50 text-amber-900", chosen: "border-amber-700 bg-amber-600 text-white" },
  goalie: { idle: "border-purple-300 bg-purple-50 text-purple-900", chosen: "border-purple-700 bg-purple-600 text-white" },
};

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function prettyDate(value: string) {
  const d = new Date(`${value}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function readStore(key: string): { pin?: string; gameId?: string } {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? "{}") as { pin?: string; gameId?: string };
  } catch {
    return {};
  }
}
function writeStore(key: string, value: { pin?: string; gameId?: string } | null) {
  try {
    if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
    else window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function StatKeeperClient({ token, teamName }: { token: string; teamName: string }) {
  const storeKey = `keeper:${token}`;
  const [stage, setStage] = useState<"pin" | "games" | "keep">("pin");
  const [restoring, setRestoring] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [gamesList, setGamesList] = useState<KeeperGameOption[]>([]);
  const [suggested, setSuggested] = useState<string | null>(null);
  const [gameId, setGameId] = useState("");
  const [gameLabel, setGameLabel] = useState("");
  const [roster, setRoster] = useState<KeeperPlayer[]>([]);
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [tally, setTally] = useState({ goals: 0, allowed: 0 });
  const [playerId, setPlayerId] = useState("");
  const [action, setAction] = useState<KeeperActionKey | "">("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [offline, setOffline] = useState(false);
  const [unsaved, setUnsaved] = useState(0);

  const queue = useRef<QueueItem[]>([]);
  const flushing = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Don't let the keeper close the tab while taps are still waiting to be sent.
  useEffect(() => {
    if (unsaved === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const adjustTally = useCallback((kind: string, delta: number) => {
    setTally((t) => ({
      goals: Math.max(0, t.goals + (kind === "goal" ? delta : 0)),
      allowed: Math.max(0, t.allowed + (kind === "goal_allowed" ? delta : 0)),
    }));
  }, []);

  const openGame = useCallback(
    async (id: string, thePin: string) => {
      setBusy(true);
      setError("");
      try {
        const res = await getKeeperGame(token, thePin, id);
        if (!res.ok) {
          setError(res.error);
          return false;
        }
        queue.current = [];
        setUnsaved(0);
        setGameId(id);
        setGameLabel(res.label);
        setRoster(res.players);
        setEvents(res.events.map((e) => ({ ...e, state: "saved" as const })));
        setTally(res.tally);
        setPlayerId("");
        setAction("");
        setNotice(null);
        setStage("keep");
        writeStore(storeKey, { pin: thePin, gameId: id });
        return true;
      } catch {
        setError("Couldn't reach the server - check your signal and try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [token, storeKey],
  );

  const unlock = useCallback(
    async (thePin: string, resumeGameId?: string) => {
      setBusy(true);
      setError("");
      try {
        const res = await unlockKeeper(token, thePin);
        if (!res.ok) {
          setError(res.error);
          return false;
        }
        setPin(thePin);
        setGamesList(res.games);
        setSuggested(res.suggestedGameId);
        writeStore(storeKey, { pin: thePin, gameId: resumeGameId });
        if (resumeGameId && res.games.some((g) => g.id === resumeGameId)) {
          if (await openGame(resumeGameId, thePin)) return true;
        }
        setStage("games");
        return true;
      } catch {
        setError("Couldn't reach the server - check your signal and try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [token, storeKey, openGame],
  );

  // Pick up where the keeper left off after a refresh (the PIN is kept only for this browser tab).
  useEffect(() => {
    void Promise.resolve().then(async () => {
      const saved = readStore(storeKey);
      if (saved.pin) await unlock(saved.pin, saved.gameId);
      setRestoring(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sends queued taps one at a time, in order. If the signal drops it keeps trying.
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (queue.current.length > 0 && alive.current) {
        const item = queue.current[0];
        let res: Awaited<ReturnType<typeof recordKeeperAction>>;
        try {
          res = await recordKeeperAction({ token, pin: item.pin, gameId: item.gameId, playerId: item.playerId, action: item.action, id: item.id });
        } catch {
          setOffline(true);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        setOffline(false);
        queue.current.shift();
        setUnsaved(queue.current.length);
        if (res.ok) {
          setEvents((prev) => prev.map((e) => (e.id === item.id ? { ...e, state: "saved" as const } : e)));
        } else {
          setEvents((prev) => prev.filter((e) => e.id !== item.id));
          adjustTally(item.kind, -1);
          setNotice({ kind: "error", text: `Not saved: ${res.error}` });
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [token, adjustTally]);

  function submitPin(ev: React.FormEvent) {
    ev.preventDefault();
    if (!/^\d{4}$/.test(pinInput)) return setError("Enter the 4-number keeper PIN.");
    void unlock(pinInput).then((ok) => {
      if (!ok) setPinInput("");
    });
  }

  function lock() {
    if (unsaved > 0 && !window.confirm("Some plays haven't been sent yet. Lock anyway and lose them?")) return;
    queue.current = [];
    setUnsaved(0);
    writeStore(storeKey, null);
    setPin("");
    setPinInput("");
    setStage("pin");
    setGameId("");
    setEvents([]);
  }

  function changeGame() {
    if (unsaved > 0 && !window.confirm("Some plays haven't been sent yet. Change game anyway and lose them?")) return;
    queue.current = [];
    setUnsaved(0);
    writeStore(storeKey, { pin });
    setStage("games");
  }

  function commit() {
    const player = roster.find((p) => p.id === playerId);
    const act = KEEPER_ACTIONS.find((a) => a.key === action);
    if (!player || !act || !gameId) return;
    const id = uuid();
    setEvents((prev) =>
      [{ id, seq: Date.now(), kind: act.kind, label: act.label, playerName: player.name, source: "keeper", state: "sending" as const }, ...prev].slice(0, 12),
    );
    adjustTally(act.kind, 1);
    queue.current.push({ id, gameId, playerId: player.id, action: act.key, kind: act.kind, pin });
    setUnsaved(queue.current.length);
    setNotice(null);
    setPlayerId("");
    setAction("");
    void flush();
  }

  async function undo(e: LocalEvent) {
    if (e.state !== "saved" || e.source !== "keeper") return;
    if (!window.confirm(`Undo ${e.label} for ${e.playerName}?`)) return;
    try {
      const res = await undoKeeperAction({ token, pin, gameId, eventId: e.id });
      if (!res.ok) return setNotice({ kind: "error", text: res.error });
      setEvents((prev) => prev.filter((x) => x.id !== e.id));
      adjustTally(e.kind, -1);
      setNotice({ kind: "ok", text: `Undid ${e.label} for ${e.playerName}.` });
    } catch {
      setNotice({ kind: "error", text: "Couldn't undo - check your signal and try again." });
    }
  }

  const cardCls = "rounded-lg border border-slate-200 bg-white p-4";
  const chosenPlayer = roster.find((p) => p.id === playerId);
  const chosenAction = KEEPER_ACTIONS.find((a) => a.key === action);

  if (restoring) return <p className="text-center text-sm text-slate-500">One moment…</p>;

  if (stage === "pin") {
    return (
      <form onSubmit={submitPin} className={cn(cardCls, "space-y-3")}>
        <label htmlFor="keeper-pin" className="text-base font-semibold text-slate-900">
          Enter the keeper PIN
        </label>
        <p className="text-sm text-slate-600">Your coach gave you a 4-number PIN for keeping stats for {teamName}.</p>
        <input
          id="keeper-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-center text-xl tracking-[0.4em]"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-md bg-brand-orange px-4 py-2.5 text-base font-semibold text-white hover:bg-brand-orange-light disabled:opacity-60">
          {busy ? "Checking…" : "Open stat keeper"}
        </button>
      </form>
    );
  }

  if (stage === "games") {
    return (
      <div className={cn(cardCls, "space-y-3")}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Which game?</h2>
          <button type="button" onClick={lock} className="text-sm font-medium text-brand-blue hover:underline">
            Lock
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {gamesList.length === 0 ? (
          <p className="text-sm text-slate-500">No games yet. Ask your coach to add the game first.</p>
        ) : (
          <ul className="space-y-2">
            {gamesList.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void openGame(g.id, pin)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-4 py-3 text-left text-base disabled:opacity-60",
                    g.id === suggested ? "border-brand-orange bg-orange-50" : "border-slate-300 bg-white hover:bg-slate-50",
                  )}
                >
                  <span className="font-medium text-slate-900">{g.opponent ? `vs ${g.opponent}` : "Game"}</span>
                  <span className="text-sm text-slate-600">
                    {prettyDate(g.date)}
                    {g.id === suggested ? " · closest to today" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      <div className={cn(cardCls, "flex flex-wrap items-center justify-between gap-2")}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{gameLabel}</p>
          <p className="text-sm text-slate-600">
            Goals <strong className="text-slate-900">{tally.goals}</strong> &middot; Goals allowed <strong className="text-slate-900">{tally.allowed}</strong>
          </p>
        </div>
        <div className="flex gap-3 text-sm font-medium">
          <button type="button" onClick={changeGame} className="text-brand-blue hover:underline">
            Change game
          </button>
          <button type="button" onClick={lock} className="text-brand-blue hover:underline">
            Lock
          </button>
        </div>
      </div>

      {offline && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No signal. Your taps are held on this screen ({unsaved} waiting) and will send when you&apos;re back online. Keep this page open.
        </p>
      )}
      {notice && <p className={cn("rounded-md px-3 py-2 text-sm", notice.kind === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{notice.text}</p>}

      <section className={cardCls}>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">1. Choose the player</h2>
        {roster.length === 0 ? (
          <p className="text-sm text-slate-500">No available players for this game.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {roster.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlayerId(p.id === playerId ? "" : p.id)}
                aria-pressed={p.id === playerId}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center rounded-md border px-1 py-2 text-center",
                  p.id === playerId ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
                )}
              >
                <span className="text-xl font-bold leading-none">{p.number ? `#${p.number}` : "–"}</span>
                <span className="mt-1 line-clamp-2 text-xs leading-tight">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className={cardCls}>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">2. Choose the action</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KEEPER_ACTIONS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAction(a.key === action ? "" : a.key)}
              aria-pressed={a.key === action}
              className={cn(
                "min-h-14 rounded-md border px-2 py-3 text-base font-semibold",
                a.key === action ? GROUP_STYLE[a.group].chosen : GROUP_STYLE[a.group].idle,
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Recent plays</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing recorded for this game yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className={cn("min-w-0 truncate", e.kind === "goal" ? "font-semibold text-green-700" : e.kind === "goal_allowed" ? "font-semibold text-red-600" : "text-slate-800")}>
                  {e.label} &ndash; {e.playerName}
                </span>
                {e.state === "sending" ? (
                  <span className="shrink-0 text-xs text-slate-400">sending…</span>
                ) : e.source === "keeper" ? (
                  <button type="button" onClick={() => void undo(e)} className="shrink-0 font-medium text-red-600 hover:underline">
                    Undo
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">imported</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            onClick={commit}
            disabled={!chosenPlayer || !chosenAction}
            className="w-full rounded-md bg-brand-orange px-4 py-3.5 text-lg font-bold text-white hover:bg-brand-orange-light disabled:bg-slate-300 disabled:text-slate-500"
          >
            {chosenPlayer && chosenAction
              ? `Commit: ${chosenAction.label} – ${chosenPlayer.number ? `#${chosenPlayer.number} ` : ""}${chosenPlayer.name}`
              : chosenPlayer
                ? "Now choose an action"
                : chosenAction
                  ? "Now choose a player"
                  : "Choose a player and an action"}
          </button>
        </div>
      </div>
    </div>
  );
}
