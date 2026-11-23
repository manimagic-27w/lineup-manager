"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteParentClip, updateParentClipCaption, type CoachClipDTO } from "@/actions/parent-clips";
import { CLIP_DELETE_NOTICE, daysLeft, daysLeftLabel, formatClipSize } from "@/lib/clip-plan";

function ClipItem({ clip, teamId, onChanged }: { clip: CoachClipDTO; teamId: string; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(clip.caption);
  const [error, setError] = useState("");

  function save() {
    setError("");
    startTransition(async () => {
      const res = await updateParentClipCaption(teamId, clip.id, text);
      if (!res.ok) return setError(res.error);
      setEditing(false);
      onChanged();
    });
  }
  function remove() {
    if (!window.confirm(`Delete "${clip.caption || clip.filename}" from ${clip.uploaderName}? Parents will no longer be able to watch or download it.`)) return;
    setError("");
    startTransition(async () => {
      const res = await deleteParentClip(teamId, clip.id);
      if (!res.ok) setError(res.error);
      else onChanged();
    });
  }

  return (
    <li className="space-y-2 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {clip.caption ? (
            <p className="truncate text-sm font-medium text-slate-900">{clip.caption}</p>
          ) : (
            <p className="truncate text-sm text-slate-500">
              <span className="font-medium text-amber-800">No description</span> &ndash; {clip.filename}
            </p>
          )}
          <p className="text-xs text-slate-500">
            {clip.scopeLabel} · {clip.uploaderName} · {formatClipSize(clip.bytes)} · {daysLeftLabel(daysLeft(clip.expiresAtMs))}
          </p>
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-2">
            <button type="button" disabled={pending} onClick={() => { setText(clip.caption); setEditing(true); }} className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-60">
              {clip.caption ? "Edit" : "Add description"}
            </button>
            <button type="button" disabled={pending} onClick={remove} className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60">
              Delete
            </button>
          </div>
        )}
      </div>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={120}
            autoFocus
            aria-label="Clip description"
            placeholder="e.g. Goal in the 2nd half"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button type="submit" disabled={pending} className="rounded-md bg-brand-orange px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-orange-light disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" disabled={pending} onClick={() => setEditing(false)} className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-60">
            Cancel
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </li>
  );
}

/** Parent clips card (Games tab, and the platform page for platform admins): the clips parents have
 *  shared, with a way to add or fix a description and to delete anything that shouldn't be there. */
export function ParentClipsManager({
  teamId,
  clips,
  configured,
  title = "Parent clips",
}: {
  teamId: string;
  clips: CoachClipDTO[];
  configured: boolean;
  title?: string;
}) {
  const router = useRouter();
  const missing = clips.filter((c) => !c.caption).length;

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-600">
        Parents add clips from the same parents&apos; video link (link + PIN). {CLIP_DELETE_NOTICE} You can add or fix a description, or delete any clip right away.
      </p>
      {!configured && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Clip storage isn&apos;t set up on this server yet, so parents can&apos;t upload. See PRODUCTION.md.</p>}
      {!configured ? null : clips.length === 0 ? (
        <p className="text-sm text-slate-500">No clips have been shared yet.</p>
      ) : (
        <>
          {missing > 0 && (
            <p className="text-xs text-amber-800">
              {missing} clip{missing === 1 ? " has" : "s have"} no description. Use <strong>Add description</strong> so parents can tell them apart.
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {clips.map((c) => (
              <ClipItem key={c.id} clip={c} teamId={teamId} onChanged={() => router.refresh()} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
