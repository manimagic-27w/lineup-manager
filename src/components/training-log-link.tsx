"use client";

import { useState, useTransition } from "react";
import { setTrainingLogLink } from "@/actions/training-log";

/** The Training tab's link card: turn the public player-log link on, copy it, replace it or turn it off. */
export function TrainingLogLink({ teamId, url }: { teamId: string; url: string | null }) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function run(mode: "enable" | "regenerate" | "disable") {
    if (mode === "regenerate" && !window.confirm("Make a new link? The old link will stop working, so you'll need to share the new one with players.")) return;
    if (mode === "disable" && !window.confirm("Turn the link off? Players will no longer be able to log time until you turn it back on.")) return;
    startTransition(async () => {
      await setTrainingLogLink(teamId, mode);
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

  const button = "rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-60";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Player log link</h2>
      {url ? (
        <>
          <p className="mt-1 text-sm text-slate-600">
            Share this link with your players. No sign-in needed: they pick their name and log their time. Anyone who
            has the link can use it, so only share it with your team.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm" aria-label="Player log link" />
            <button type="button" onClick={copy} className="rounded-md bg-brand-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-light">
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer" className={button}>
              Open page
            </a>
            <button type="button" onClick={() => run("regenerate")} disabled={pending} className={button}>
              Make a new link
            </button>
            <button type="button" onClick={() => run("disable")} disabled={pending} className={button}>
              Turn off
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">
            Turn on a link that lets players log wall ball and other individual work without signing in. You&rsquo;ll see
            what they log below.
          </p>
          <button
            type="button"
            onClick={() => run("enable")}
            disabled={pending}
            className="mt-3 rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange-light disabled:opacity-60"
          >
            {pending ? "Turning on…" : "Turn on player log link"}
          </button>
        </>
      )}
    </div>
  );
}
