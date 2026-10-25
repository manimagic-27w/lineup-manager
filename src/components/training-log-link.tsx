"use client";

import { useState, useTransition } from "react";
import { setTrainingLogLink, type LogLinkKind } from "@/actions/training-log";

const COPY = {
  players: {
    title: "Player log link",
    on: "Share this link with your players. No sign-in needed: they pick their name, set a PIN and log their time. Anyone who has the link can open it, so only share it with your team.",
    off: "Turn on a link that lets players log wall ball and other individual work without signing in. You\u2019ll see what they log below.",
    turnOn: "Turn on player log link",
    offWarning: "Turn the link off? Players will no longer be able to log time until you turn it back on.",
    newWarning: "Make a new link? The old link will stop working, so you'll need to share the new one with players.",
  },
  parents: {
    title: "Parent approval link",
    on: "Share this link with your parents. No sign-in needed: a parent picks their child, types their own mobile number to confirm it matches the number the child entered, and approves the time. Only approved time counts in your summary.",
    off: "Turn on a link that lets parents approve their child\u2019s logged time without signing in. Time stays pending until a parent approves it.",
    turnOn: "Turn on parent approval link",
    offWarning: "Turn the link off? Parents will not be able to approve time until you turn it back on.",
    newWarning: "Make a new link? The old link will stop working, so you'll need to share the new one with parents.",
  },
} as const;

/** A Training-tab link card: turn a public link (players' log page or parents' approval page) on,
 *  copy it, replace it or turn it off. */
export function TrainingLogLink({ teamId, url, kind = "players" }: { teamId: string; url: string | null; kind?: LogLinkKind }) {
  const copyText = COPY[kind];
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function run(mode: "enable" | "regenerate" | "disable") {
    if (mode === "regenerate" && !window.confirm(copyText.newWarning)) return;
    if (mode === "disable" && !window.confirm(copyText.offWarning)) return;
    startTransition(async () => {
      await setTrainingLogLink(teamId, mode, kind);
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
      <h2 className="text-sm font-semibold text-slate-900">{copyText.title}</h2>
      {url ? (
        <>
          <p className="mt-1 text-sm text-slate-600">{copyText.on}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm" aria-label={copyText.title} />
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
          <p className="mt-1 text-sm text-slate-600">{copyText.off}</p>
          <button
            type="button"
            onClick={() => run("enable")}
            disabled={pending}
            className="mt-3 rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange-light disabled:opacity-60"
          >
            {pending ? "Turning on…" : copyText.turnOn}
          </button>
        </>
      )}
    </div>
  );
}
