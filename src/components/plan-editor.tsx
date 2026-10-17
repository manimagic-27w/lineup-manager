"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { copyPlan, deletePlan, saveDrillToLibrary, savePlan } from "@/actions/practices";
import { clockTimes, MAX_TAGS, normalizeTags, SUGGESTED_TAGS, totalMinutes } from "@/lib/practice";
import { cn } from "@/lib/utils";

type Item = { key: string; name: string; minutes: number; notes: string };
type LibraryDrill = { id: string; name: string; minutes: number; notes: string };
export type PlanEditorInitial = {
  id: string | null;
  title: string;
  practiceDate: string;
  startTime: string;
  goals: string;
  tags: string[];
  isTemplate: boolean;
  items: { name: string; minutes: number; notes: string }[];
};

let keySeq = 0;
const newKey = () => `k${++keySeq}`;
const field = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export function PlanEditor({
  teamId,
  initial,
  library,
  knownTags,
}: {
  teamId: string;
  initial: PlanEditorInitial;
  library: LibraryDrill[];
  knownTags: string[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [practiceDate, setPracticeDate] = useState(initial.practiceDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [goals, setGoals] = useState(initial.goals);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [items, setItems] = useState<Item[]>(() => initial.items.map((i) => ({ ...i, key: newKey() })));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const isTemplate = initial.isTemplate;

  const times = clockTimes(startTime, items.map((i) => i.minutes));
  const total = totalMinutes(items);
  const suggestions = Array.from(new Set([...SUGGESTED_TAGS, ...knownTags])).filter(
    (t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()),
  );

  function addTag(raw: string) {
    setTags((cur) => normalizeTags([...cur, raw]));
    setTagDraft("");
  }
  function updateItem(key: string, patch: Partial<Item>) {
    setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function move(index: number, dir: -1 | 1) {
    setItems((cur) => {
      const j = index + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }
  function addFromLibrary(id: string) {
    const d = library.find((x) => x.id === id);
    if (d) setItems((cur) => [...cur, { key: newKey(), name: d.name, minutes: d.minutes, notes: d.notes }]);
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const { id } = await savePlan({
          teamId,
          planId: initial.id,
          title,
          practiceDate,
          startTime,
          goals,
          tags,
          isTemplate,
          items: items.map(({ name, minutes, notes }) => ({ name, minutes, notes })),
        });
        if (!initial.id) {
          router.replace(`/teams/${teamId}/practices/${id}`);
        } else {
          setMessage({ kind: "ok", text: "Saved." });
          router.refresh();
        }
      } catch {
        setMessage({ kind: "error", text: "Couldn't save. Check that the title and every drill name are filled in." });
      }
    });
  }

  function libraryDrill(item: Item) {
    startTransition(async () => {
      try {
        await saveDrillToLibrary({ teamId, name: item.name, minutes: item.minutes, notes: item.notes, tags });
        setMessage({ kind: "ok", text: `Saved "${item.name}" to the drill library.` });
        router.refresh();
      } catch {
        setMessage({ kind: "error", text: "Couldn't save that drill - it needs a name." });
      }
    });
  }

  function makeCopy(as: "template" | "plan") {
    startTransition(async () => {
      try {
        const { id } = await copyPlan(teamId, initial.id!, as);
        router.push(`/teams/${teamId}/practices/${id}`);
      } catch {
        setMessage({ kind: "error", text: "Couldn't make the copy." });
      }
    });
  }

  function remove() {
    if (!initial.id || !window.confirm(`Delete "${initial.title}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deletePlan(teamId, initial.id!);
      router.push(`/teams/${teamId}/practices${isTemplate ? "?view=templates" : ""}`);
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <label htmlFor="plan-title" className="text-xs font-medium text-slate-600">
              {isTemplate ? "Template name" : "Title"}
            </label>
            <input
              id="plan-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Tuesday ground balls"
              className={cn(field, "w-full")}
            />
          </div>
          {!isTemplate && (
            <div className="flex flex-col gap-1">
              <label htmlFor="plan-date" className="text-xs font-medium text-slate-600">
                Practice date
              </label>
              <input id="plan-date" type="date" value={practiceDate} onChange={(e) => setPracticeDate(e.target.value)} className={field} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="plan-start" className="text-xs font-medium text-slate-600">
              Start time
            </label>
            <input id="plan-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} />
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-600">Tags</span>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTags((cur) => cur.filter((x) => x !== t))}
                className="rounded-full bg-brand-blue px-2.5 py-1 text-xs font-medium text-white"
                title="Remove tag"
              >
                {t} ×
              </button>
            ))}
            {tags.length === 0 && <span className="text-xs text-slate-400">No tags yet</span>}
          </div>
          {tags.length < MAX_TAGS && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-blue hover:text-brand-blue"
                  >
                    + {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(tagDraft);
                    }
                  }}
                  placeholder="Add your own tag"
                  className={cn(field, "w-48")}
                />
                <button type="button" onClick={() => addTag(tagDraft)} className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200">
                  Add
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="plan-goals" className="text-xs font-medium text-slate-600">
            Goals / notes
          </label>
          <textarea
            id="plan-goals"
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            rows={3}
            placeholder="What this practice is about, equipment to bring, things to watch for."
            className={cn(field, "w-full")}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Drills</h2>
          <span className="text-sm text-slate-500">
            {items.length} drill{items.length === 1 ? "" : "s"} &middot; {total} min total
          </span>
        </div>

        {items.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No drills yet. Add one below, or pick one from your drill library.
          </p>
        )}

        <ol className="space-y-3">
          {items.map((item, i) => (
            <li key={item.key} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="w-16 shrink-0 pt-1.5 text-xs font-medium tabular-nums text-slate-500">
                  {times[i] ?? `#${i + 1}`}
                </div>
                <div className="flex min-w-[12rem] flex-1 flex-col gap-2">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(item.key, { name: e.target.value })}
                    placeholder="Drill name"
                    aria-label={`Drill ${i + 1} name`}
                    className={cn(field, "w-full font-medium")}
                  />
                  <textarea
                    value={item.notes}
                    onChange={(e) => updateItem(item.key, { notes: e.target.value })}
                    rows={2}
                    placeholder="Setup, coaching points, progressions"
                    aria-label={`Drill ${i + 1} notes`}
                    className={cn(field, "w-full")}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={item.minutes}
                    onChange={(e) => updateItem(item.key, { minutes: Math.max(0, Math.min(300, Math.round(Number(e.target.value) || 0))) })}
                    aria-label={`Drill ${i + 1} minutes`}
                    className={cn(field, "w-16 text-right")}
                  />
                  <span className="text-xs text-slate-500">min</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 pl-0 sm:pl-[4.75rem]">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs hover:bg-slate-200 disabled:opacity-40">
                  ↑ Up
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs hover:bg-slate-200 disabled:opacity-40">
                  ↓ Down
                </button>
                <button type="button" onClick={() => libraryDrill(item)} disabled={pending || !item.name.trim()} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs hover:bg-slate-200 disabled:opacity-40">
                  Save to library
                </button>
                <button type="button" onClick={() => setItems((cur) => cur.filter((x) => x.key !== item.key))} className="rounded-md px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setItems((cur) => [...cur, { key: newKey(), name: "", minutes: 10, notes: "" }])}
            disabled={items.length >= 40}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            + Add drill
          </button>
          {library.length > 0 && (
            <select
              value=""
              onChange={(e) => addFromLibrary(e.target.value)}
              aria-label="Add a drill from the library"
              className={cn(field, "max-w-[16rem]")}
            >
              <option value="">Add from library…</option>
              {library.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.minutes} min)
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange-light disabled:opacity-60"
        >
          {pending ? "Saving…" : initial.id ? "Save changes" : isTemplate ? "Create template" : "Create plan"}
        </button>
        {initial.id && !isTemplate && (
          <>
            <a
              href={`/teams/${teamId}/practices/${initial.id}/print`}
              target="printPracticePlan"
              className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200"
            >
              Print
            </a>
            <button type="button" onClick={() => makeCopy("template")} disabled={pending} className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-60">
              Save as template
            </button>
          </>
        )}
        {initial.id && isTemplate && (
          <button type="button" onClick={() => makeCopy("plan")} disabled={pending} className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-60">
            Start a plan from this
          </button>
        )}
        {initial.id && (
          <button type="button" onClick={remove} disabled={pending} className="ml-auto rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
            Delete
          </button>
        )}
        {message && (
          <span className={cn("text-sm", message.kind === "ok" ? "text-emerald-700" : "text-red-600")} role="status">
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
