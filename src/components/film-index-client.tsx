"use client";

import { useEffect, useState } from "react";
import { unlockFilmIndex } from "@/actions/film-index";
import type { FilmIndexGame, FilmIndexSeason } from "@/lib/film-index";

function prettyDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function readPin(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writePin(key: string, pin: string | null) {
  try {
    if (pin) window.sessionStorage.setItem(key, pin);
    else window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function GameRow({ g }: { g: FilmIndexGame }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{g.opponent ? `vs ${g.opponent}` : "Game"}</p>
        <p className="text-xs text-slate-500">
          {prettyDate(g.date)}
          {g.result ? ` · ${g.result}` : ""}
          {g.friendly ? " · scrimmage" : ""}
        </p>
      </div>
      <a
        href={g.href}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-md bg-brand-orange px-4 py-2 text-sm font-semibold text-white hover:bg-brand-orange-light"
      >
        Watch
      </a>
    </li>
  );
}

export function FilmIndexClient({ token, teamName }: { token: string; teamName: string }) {
  const storeKey = `film:${token}`;
  const [restoring, setRestoring] = useState(true);
  const [seasons, setSeasons] = useState<FilmIndexSeason[] | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock(pin: string): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const res = await unlockFilmIndex(token, pin);
      if (!res.ok) {
        setError(res.error);
        writePin(storeKey, null);
        return false;
      }
      writePin(storeKey, pin);
      setSeasons(res.seasons);
      return true;
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Come back to the list after a refresh (the PIN is kept only for this browser tab).
  useEffect(() => {
    void Promise.resolve().then(async () => {
      const saved = readPin(storeKey);
      if (saved) await unlock(saved);
      setRestoring(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (restoring) return <p className="text-center text-sm text-slate-500">One moment…</p>;

  if (!seasons) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^\d{4}$/.test(pinInput)) return setError("Enter the 4-number PIN.");
          void unlock(pinInput);
        }}
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <label htmlFor="film-pin" className="text-base font-semibold text-slate-900">
          Enter the PIN
        </label>
        <p className="text-sm text-slate-600">Your coach gave you a 4-number PIN to watch {teamName} game video.</p>
        <input
          id="film-pin"
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
          {busy ? "Checking…" : "See game video"}
        </button>
      </form>
    );
  }

  if (seasons.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">No game video has been posted yet. Check back after the next game.</p>;
  }

  return (
    <div className="space-y-6">
      {seasons.map((season) => (
        <section key={season.name ?? "none"} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{season.name ?? "Other games"}</h2>
          {season.tournaments.map((t) => (
            <div key={t.name ?? "none"} className="rounded-lg border border-slate-200 bg-white px-4">
              {t.name && <p className="border-b border-slate-100 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.name}</p>}
              <ul className="divide-y divide-slate-100">
                {t.games.map((g) => (
                  <GameRow key={g.id} g={g} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      <button
        type="button"
        onClick={() => {
          writePin(storeKey, null);
          setSeasons(null);
          setPinInput("");
        }}
        className="block w-full text-center text-sm font-medium text-brand-blue hover:underline"
      >
        Lock
      </button>
    </div>
  );
}
