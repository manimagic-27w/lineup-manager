"use client";

import { useState, useTransition } from "react";
import { changeStatKeeperPin, disableStatKeeper, enableStatKeeper, regenerateStatKeeperLink } from "@/actions/stat-keeper";

/** Stat tab card: turn the no-login stat keeper link on with a PIN, copy it, change the PIN, make a
 *  new link or turn it off. */
export function StatKeeperSetup({ teamId, url }: { teamId: string; url: string | null }) {
  const [pending, startTransition] = useTransition();
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const button = "rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-60";
  const pinInput = (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={4}
      value={pin}
      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
      placeholder="4-number PIN"
      aria-label="Keeper PIN"
      className="w-36 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
    />
  );

  function save(kind: "enable" | "pin") {
    setMessage(null);
    startTransition(async () => {
      const res = kind === "enable" ? await enableStatKeeper(teamId, pin) : await changeStatKeeperPin(teamId, pin);
      if (!res.ok) return setMessage({ kind: "error", text: res.error });
      setPin("");
      setMessage({ kind: "ok", text: kind === "enable" ? "Stat keeper link is on." : "New PIN saved." });
    });
  }

  function newLink() {
    if (!window.confirm("Make a new link? The old link will stop working, so you'll need to send the new one to your keeper.")) return;
    startTransition(async () => {
      await regenerateStatKeeperLink(teamId);
    });
  }

  function turnOff() {
    if (!window.confirm("Turn the stat keeper link off? Nobody will be able to keep stats from it until you turn it on again.")) return;
    startTransition(async () => {
      await disableStatKeeper(teamId);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Stat keeper link</h3>
      {url ? (
        <>
          <p className="mt-1 text-sm text-slate-600">
            Send this link and the PIN to whoever is keeping stats. The PIN isn&apos;t shown again, so set a new one if you forget it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm" aria-label="Stat keeper link" />
            <button type="button" onClick={copy} className="rounded-md bg-brand-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-light">
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pinInput}
            <button type="button" onClick={() => save("pin")} disabled={pending || pin.length !== 4} className={button}>
              Set new PIN
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer" className={button}>
              Open page
            </a>
            <button type="button" onClick={newLink} disabled={pending} className={button}>
              Make a new link
            </button>
            <button type="button" onClick={turnOff} disabled={pending} className={button}>
              Turn off
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">Choose a 4-number PIN for your keeper, then turn the link on. The keeper needs both the link and the PIN.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pinInput}
            <button
              type="button"
              onClick={() => save("enable")}
              disabled={pending || pin.length !== 4}
              className="rounded-md bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-light disabled:opacity-60"
            >
              {pending ? "Turning on…" : "Turn on stat keeper link"}
            </button>
          </div>
        </>
      )}
      {message && <p className={message.kind === "ok" ? "mt-2 text-sm text-green-700" : "mt-2 text-sm text-red-600"}>{message.text}</p>}
    </div>
  );
}
