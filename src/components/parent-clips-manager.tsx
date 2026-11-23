"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteParentClip, type CoachClipDTO } from "@/actions/parent-clips";
import { CLIP_DELETE_NOTICE, daysLeft, daysLeftLabel, formatClipSize } from "@/lib/clip-plan";

/** Games tab card (only when Parent clip sharing is on for the team): the clips parents have shared,
 *  with a Delete button for anything that shouldn't be there. */
export function ParentClipsManager({ teamId, clips, configured }: { teamId: string; clips: CoachClipDTO[]; configured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function remove(clip: CoachClipDTO) {
    if (!window.confirm(`Delete "${clip.caption || clip.filename}" from ${clip.uploaderName}? Parents will no longer be able to watch or download it.`)) return;
    setError("");
    startTransition(async () => {
      const res = await deleteParentClip(teamId, clip.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Parent clips</h2>
      <p className="text-sm text-slate-600">
        Parents add clips from the same parents&apos; video link (link + PIN). {CLIP_DELETE_NOTICE} You can delete any clip right away.
      </p>
      {!configured && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Clip storage isn&apos;t set up on this server yet, so parents can&apos;t upload. See PRODUCTION.md.</p>}
      {!configured ? null : clips.length === 0 ? (
        <p className="text-sm text-slate-500">No clips have been shared yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {clips.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{c.caption || c.filename}</p>
                <p className="text-xs text-slate-500">
                  {c.scopeLabel} · {c.uploaderName} · {formatClipSize(c.bytes)} · {daysLeftLabel(daysLeft(c.expiresAtMs))}
                </p>
              </div>
              <button type="button" disabled={pending} onClick={() => remove(c)} className="shrink-0 rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
