"use client";

import { useState, useTransition } from "react";
import { addGuestToGame, createGuestForGame } from "@/actions/guests";
import { POSITIONS } from "@/lib/db/schema";

type GuestOption = { id: string; name: string; number: string | null; position: string | null };

/**
 * "Add guest" for a single game. A guest is someone who isn't on the core roster (a call-up, a
 * borrowed player, a tournament fill-in). Previously used guests are kept on a guest roster, so
 * the coach can pick one from the list; a new name creates the guest and reuses them next time.
 */
export function AddGuest({
  teamId,
  gameId,
  guests,
  experienceLevels,
}: {
  teamId: string;
  gameId: string;
  guests: GuestOption[];
  experienceLevels: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function addExisting() {
    if (!pick) return;
    setMessage(null);
    const fd = new FormData();
    fd.set("teamId", teamId);
    fd.set("gameId", gameId);
    fd.set("playerId", pick);
    startTransition(async () => {
      try {
        const res = await addGuestToGame(fd);
        if (res.ok) {
          setPick("");
          setMessage({ kind: "ok", text: "Guest added to this game." });
        } else {
          setMessage({ kind: "error", text: res.error });
        }
      } catch {
        setMessage({ kind: "error", text: "Couldn't add the guest. Please try again." });
      }
    });
  }

  function addNew(form: HTMLFormElement) {
    setMessage(null);
    const fd = new FormData(form);
    fd.set("teamId", teamId);
    fd.set("gameId", gameId);
    startTransition(async () => {
      try {
        const res = await createGuestForGame(fd);
        if (res.ok) {
          form.reset();
          setMessage({
            kind: "ok",
            text: res.reused ? "That guest was already on your guest roster - added to this game." : "Guest added to this game.",
          });
        } else {
          setMessage({ kind: "error", text: res.error });
        }
      } catch {
        setMessage({ kind: "error", text: "Couldn't add the guest. Please try again." });
      }
    });
  }

  return (
    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
      >
        {open ? "Close" : "+ Add guest"}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {guests.length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="guest-pick" className="block text-xs font-medium text-slate-600">
                Pick from your guest roster
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="guest-pick"
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Choose a guest…</option>
                  {guests.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.number ? ` #${g.number}` : ""}
                      {g.position ? ` · ${g.position}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addExisting}
                  disabled={!pick || pending}
                  className="rounded-md bg-brand-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-light disabled:opacity-50"
                >
                  {pending ? "Adding…" : "Add to game"}
                </button>
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addNew(e.currentTarget);
            }}
            className="space-y-2"
          >
            <p className="text-xs font-medium text-slate-600">{guests.length > 0 ? "Or add a new guest" : "Add a new guest"}</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="guest-name" className="text-xs text-slate-500">
                  Name
                </label>
                <input
                  id="guest-name"
                  name="name"
                  required
                  className="w-40 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="guest-number" className="text-xs text-slate-500">
                  #
                </label>
                <input
                  id="guest-number"
                  name="number"
                  className="w-14 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="guest-position" className="text-xs text-slate-500">
                  Position
                </label>
                <select
                  id="guest-position"
                  name="position"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">-</option>
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="guest-grade" className="text-xs text-slate-500">
                  Grade
                </label>
                <input
                  id="guest-grade"
                  name="grade"
                  className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="guest-experience" className="text-xs text-slate-500">
                  Experience
                </label>
                <select
                  id="guest-experience"
                  name="experience"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">-</option>
                  {experienceLevels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-brand-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-light disabled:opacity-50"
              >
                {pending ? "Adding…" : "Add guest"}
              </button>
            </div>
          </form>
          <p className="text-xs text-slate-500">
            Guests stay off your main roster and only appear on games you add them to. They&rsquo;re saved to a guest
            roster so you can reuse them, and show up in History.
          </p>
        </div>
      )}

      {message && (
        <p role="status" className={message.kind === "ok" ? "mt-2 text-xs text-emerald-700" : "mt-2 text-xs text-red-700"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
