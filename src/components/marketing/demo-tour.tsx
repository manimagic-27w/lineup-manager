"use client";

import { useState } from "react";
import Link from "next/link";
import { DEMO_STEPS, REQUEST_ACCESS_HREF, adjacentStep } from "@/lib/marketing";
import { DEMO_SCREENS } from "@/components/marketing/demo-screens";
import { cn } from "@/lib/utils";

/**
 * Click-through preview of the app. Nothing in the framed screen is interactive or saved - the
 * visitor moves between screens with the step list or Back/Next, and each screen comes with a
 * plain-language caption.
 */
export function DemoTour({ initialStep = 0 }: { initialStep?: number }) {
  const [index, setIndex] = useState(initialStep);
  const step = DEMO_STEPS[index];
  const isLast = index === DEMO_STEPS.length - 1;

  function go(next: number) {
    setIndex(next);
    try {
      window.history.replaceState(null, "", `/demo?step=${DEMO_STEPS[next].id}`);
    } catch {
      // Non-essential: the URL just won't track the step.
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Demo steps" className="lg:sticky lg:top-6 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {DEMO_STEPS.map((s, i) => (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === index ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
                  i === index
                    ? "border-brand-orange bg-white text-brand-orange shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-brand-blue hover:text-brand-blue"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    i === index ? "bg-brand-orange text-white" : "bg-slate-100 text-slate-500"
                  )}
                >
                  {i + 1}
                </span>
                <span className="whitespace-nowrap">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0">
        <div
          role="img"
          aria-label={`Preview of the app: ${step.title}. Sample data only.`}
          className="pointer-events-none select-none overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2">
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            </span>
            <span className="ml-2 flex-1 truncate rounded-md bg-white px-3 py-1 text-xs text-slate-500">
              lacrosselineupmanager.com
            </span>
          </div>
          <div>{DEMO_SCREENS[step.id]()}</div>
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">
          A preview with sample data. Nothing here is saved.
        </p>

        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Step {index + 1} of {DEMO_STEPS.length}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              For {step.audience.toLowerCase()}
            </span>
          </div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{step.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{step.caption}</p>
          <ul className="mt-3 space-y-1.5">
            {step.notice.map((n) => (
              <li key={n} className="flex gap-2 text-sm text-slate-700">
                <span className="mt-0.5 text-brand-orange">&#10003;</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => go(adjacentStep(index, -1))}
              disabled={index === 0}
              className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
            >
              &larr; Back
            </button>
            {isLast ? (
              <a
                href={REQUEST_ACCESS_HREF}
                className="rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange-light"
              >
                Request an invite
              </a>
            ) : (
              <button
                type="button"
                onClick={() => go(adjacentStep(index, 1))}
                className="rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange-light"
              >
                Next: {DEMO_STEPS[index + 1].label} &rarr;
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-brand-blue hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
