"use client";

import { useState } from "react";
import Link from "next/link";
import { REQUEST_ACCESS_HREF, type Audience, type DemoStepId } from "@/lib/marketing";
import { cn } from "@/lib/utils";

type Content = {
  headline: string;
  sub: string;
  steps: { title: string; body: string; demo: DemoStepId }[];
  features: { title: string; body: string }[];
};

const CONTENT: Record<Audience, Content> = {
  coach: {
    headline: "Walk into game day with the lineup already set.",
    sub: "Collect availability, build your lineup in Field, Sevens or Sixes, and print it, all from your phone. No more spreadsheets and group-chat archaeology.",
    steps: [
      {
        title: "Collect availability",
        body: "Set each player to Available, Maybe or Not Available as families reply. Copy a tournament weekend's answers to every game in one click.",
        demo: "availability",
      },
      {
        title: "Build the lineup",
        body: "Pick a player for every slot. Only players who can play are offered, and everyone else lands on the bench automatically.",
        demo: "lineup",
      },
      {
        title: "Play, score, review",
        body: "Enter the final score and your record updates. See who has started where all season.",
        demo: "games",
      },
    ],
    features: [
      { title: "Lineups for every format", body: "Field, Sevens and Sixes each get the right slots, with position suggestions for who fits where." },
      { title: "Smart warnings", body: "Maybe players are highlighted yellow; a starter who becomes unavailable turns red so you can swap them." },
      { title: "Guest players", body: "Borrow a player for one game without touching your roster. Reuse guests whenever you need them." },
      { title: "Tournaments and seasons", body: "Group a weekend's games, filter by season, and mark scrimmages as friendlies so they stay out of your record." },
      { title: "Start history", body: "See every player's starts by position, built automatically from your lineups." },
      { title: "Made for the sideline", body: "Saves as you go with clear confirmation, keeps a read-only copy if signal drops, and prints a clean lineup sheet." },
    ],
  },
  club: {
    headline: "One place for every team in your club.",
    sub: "Invite your coaches, give each one the teams they run, and keep every roster, game and lineup organized in a shared, always-current place.",
    steps: [
      {
        title: "Set up your teams",
        body: "Create a team for each age group, Travel or Rec, and choose a color so they're easy to tell apart.",
        demo: "admin",
      },
      {
        title: "Invite your coaches",
        body: "Send invites by email and assign each coach to the teams they run. They only see what's theirs.",
        demo: "admin",
      },
      {
        title: "Everyone stays in sync",
        body: "Coaches update availability and lineups live, and the activity log shows who changed what and when.",
        demo: "roster",
      },
    ],
    features: [
      { title: "Coach access you control", body: "Club admins invite coaches, assign them to teams, and can promote another admin." },
      { title: "Multiple teams, one club", body: "Run Travel and Rec teams side by side, each with the experience levels that fit." },
      { title: "Activity log", body: "Plain-English history of every change, such as \"Sam put Jordan at Low Attack 1 for the game on Sat, Apr 11.\"" },
      { title: "Your data, your files", body: "Export rosters, games and scores to CSV or Excel whenever you want a backup." },
      { title: "Seasons and tournaments", body: "Keep schedules, scores and records organized across the year." },
      { title: "Roster tools", body: "Add players one at a time or import a CSV; archive players without losing their history." },
    ],
  },
};

export function AudienceHome({ initialAudience }: { initialAudience: Audience }) {
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const c = CONTENT[audience];

  function choose(next: Audience) {
    setAudience(next);
    try {
      window.history.replaceState(null, "", next === "club" ? "/?for=club" : "/");
    } catch {
      // Non-essential.
    }
  }

  return (
    <>
      <section className="bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <div
            role="tablist"
            aria-label="I am a"
            className="mx-auto mb-8 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-sm font-medium"
          >
            {(
              [
                ["coach", "I'm a coach"],
                ["club", "I run a club"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={audience === key}
                onClick={() => choose(key)}
                className={cn(
                  "rounded-full px-4 py-1.5 transition-colors",
                  audience === key ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight text-slate-900 sm:text-5xl">
            {c.headline}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{c.sub}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/demo"
              className="rounded-md bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange-light"
            >
              See how it works
            </Link>
            <a
              href={REQUEST_ACCESS_HREF}
              className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Request an invite
            </a>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Already on the app?{" "}
            <Link href="/sign-in" className="font-medium text-brand-blue hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-slate-900">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {c.steps.map((s, i) => (
            <li key={s.title} className="flex flex-col rounded-lg border border-slate-200 bg-white p-5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-orange text-sm font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1 flex-1 text-sm leading-6 text-slate-600">{s.body}</p>
              <Link
                href={`/demo?step=${s.demo}`}
                className="mt-3 text-sm font-medium text-brand-blue hover:underline"
              >
                See it in the demo &rarr;
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-slate-900">
            {audience === "coach" ? "Built for the way coaches work" : "Built for clubs with more than one team"}
          </h2>
          <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {c.features.map((f) => (
              <li key={f.title}>
                <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                  <span className="h-2 w-2 rounded-full bg-brand-blue" aria-hidden />
                  {f.title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-14 text-center sm:px-6">
        <h2 className="text-2xl font-bold text-slate-900">Take a look around</h2>
        <p className="mt-2 text-slate-600">
          Click through a short preview of the real screens, with sample data and no sign-up.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/demo"
            className="rounded-md bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange-light"
          >
            Start the demo
          </Link>
          <Link
            href="/guides/quick-start-guide.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Quick start guide (PDF)
          </Link>
        </div>
      </section>
    </>
  );
}
