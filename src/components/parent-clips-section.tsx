"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelClipUpload,
  finishClipUpload,
  getClipLinks,
  getClipsHub,
  startClipUpload,
  type ClipDTO,
  type ClipGameOption,
  type ClipTournamentOption,
} from "@/actions/parent-clips";
import { CLIP_DELETE_NOTICE, CLIP_LIFETIME_DAYS, MAX_CLIP_BYTES, MB, checkClipFile, daysLeft, daysLeftLabel, formatClipSize } from "@/lib/clip-plan";
import { cn } from "@/lib/utils";
import { CollapsibleGroup } from "@/components/collapsible-group";

type Hub = { configured: boolean; games: ClipGameOption[]; tournaments: ClipTournamentOption[]; clips: ClipDTO[] };

function prettyDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
const gameLabel = (g: ClipGameOption) => `${prettyDate(g.date)}${g.opponent ? ` vs ${g.opponent}` : ""}`;

const NAME_KEY = "clip-uploader-name";
function readName() {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
function saveName(value: string) {
  try {
    window.localStorage.setItem(NAME_KEY, value);
  } catch {
    /* ignore */
  }
}

/** Sends one file straight to storage, reporting progress. */
function putToStorage(url: string, file: File, contentType: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage refused the upload (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("The connection dropped while uploading."));
    xhr.send(file);
  });
}

type UploadRow = { name: string; state: "waiting" | "uploading" | "done" | "error"; percent: number; error?: string };

function DeleteBanner({ className }: { className?: string }) {
  return (
    <p className={cn("rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900", className)} role="note">
      {CLIP_DELETE_NOTICE}
    </p>
  );
}

function ClipRow({ clip, token, pin }: { clip: ClipDTO; token: string; pin: string }) {
  const [view, setView] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const days = daysLeft(clip.expiresAtMs);

  async function links() {
    const res = await getClipLinks({ token, pin, clipId: clip.id });
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    return res;
  }
  async function play() {
    if (view) return setView(null);
    setBusy(true);
    setError("");
    const res = await links();
    setBusy(false);
    if (res) setView(res.viewUrl);
  }
  async function download() {
    setBusy(true);
    setError("");
    const res = await links();
    setBusy(false);
    if (res) window.location.assign(res.downloadUrl);
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{clip.caption || clip.filename}</p>
          <p className="text-xs text-slate-500">
            Shared by {clip.uploaderName} · {formatClipSize(clip.bytes)} ·{" "}
            <span className={cn("font-medium", days <= 7 ? "text-red-700" : "text-amber-800")}>{daysLeftLabel(days)}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={play} disabled={busy} className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-60">
            {view ? "Hide" : "Play"}
          </button>
          <button type="button" onClick={download} disabled={busy} className="rounded-md bg-brand-orange px-3 py-2 text-sm font-semibold text-white hover:bg-brand-orange-light disabled:opacity-60">
            Download
          </button>
        </div>
      </div>
      {view && (
        <div className="space-y-1">
          <video
            src={view}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-md bg-black"
            onError={() => setError("This video can't play in your browser. Tap Download to save it and watch it on your phone.")}
          />
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </li>
  );
}

export function ParentClipsSection({ token, pin }: { token: string; pin: string }) {
  const [hub, setHub] = useState<Hub | null>(null);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState(""); // "g:<id>" or "t:<id>"
  const [name, setName] = useState("");
  const [caption, setCaption] = useState("");
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await getClipsHub(token, pin);
    if (res.ok && res.enabled) setHub({ configured: res.configured, games: res.games, tournaments: res.tournaments, clips: res.clips });
  }, [token, pin]);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      setName(readName());
      await load();
    });
  }, [load]);

  if (!hub) return null;

  function update(i: number, patch: Partial<UploadRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function upload(files: File[]) {
    setMessage("");
    if (!scope) return setMessage("Choose a game or a tournament first.");
    if (!name.trim()) return setMessage("Enter your first name so other parents know who shared it.");
    for (const f of files) {
      const check = checkClipFile(f.name, f.size);
      if (!check.ok) return setMessage(`${f.name}: ${check.error}`);
    }
    saveName(name.trim());
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, state: "waiting", percent: 0 })));
    const [kind, id] = scope.split(":");
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      update(i, { state: "uploading" });
      let clipId: string | null = null;
      try {
        const start = await startClipUpload({
          token,
          pin,
          gameId: kind === "g" ? id : null,
          tournamentId: kind === "t" ? id : null,
          filename: file.name,
          bytes: file.size,
          uploaderName: name,
          caption,
        });
        if (!start.ok) throw new Error(start.error);
        clipId = start.clipId;
        await putToStorage(start.url, file, start.contentType, (fraction) => update(i, { percent: Math.round(fraction * 100) }));
        const done = await finishClipUpload({ token, pin, clipId });
        if (!done.ok) throw new Error(done.error);
        update(i, { state: "done", percent: 100 });
      } catch (e) {
        if (clipId) void cancelClipUpload({ token, pin, clipId });
        update(i, { state: "error", error: e instanceof Error ? e.message : "Upload failed." });
      }
    }
    setBusy(false);
    setOpenKeys((prev) => new Set(prev).add(scope));
    setCaption("");
    if (fileRef.current) fileRef.current.value = "";
    await load();
  }

  // Group clips under their tournament or game, newest group first.
  const groups: { key: string; title: string; clips: ClipDTO[] }[] = [];
  const tournamentById = new Map(hub.tournaments.map((t) => [t.id, t.name]));
  const gameById = new Map(hub.games.map((g) => [g.id, g]));
  const seen = new Map<string, number>();
  for (const c of hub.clips) {
    const key = c.tournamentId ? `t:${c.tournamentId}` : `g:${c.gameId}`;
    const title = c.tournamentId ? `Tournament: ${tournamentById.get(c.tournamentId) ?? "Tournament"}` : gameById.get(c.gameId ?? "") ? gameLabel(gameById.get(c.gameId ?? "")!) : "Game";
    let at = seen.get(key);
    if (at === undefined) {
      at = groups.length;
      seen.set(key, at);
      groups.push({ key, title, clips: [] });
    }
    groups[at].clips.push(c);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Parent clips</h2>
      <DeleteBanner />

      {!hub.configured ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Clip uploads aren&apos;t set up yet. Ask your coach.</p>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {open ? "Close" : "+ Add a clip"}
          </button>
          {open && (
            <div className="mt-3 space-y-3">
              <div className="space-y-1">
                <label htmlFor="clip-scope" className="block text-xs font-medium text-slate-600">
                  Which game or tournament?
                </label>
                <select id="clip-scope" value={scope} onChange={(e) => setScope(e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm">
                  <option value="">Choose…</option>
                  {hub.tournaments.length > 0 && (
                    <optgroup label="Tournaments">
                      {hub.tournaments.map((t) => (
                        <option key={t.id} value={`t:${t.id}`}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {hub.games.length > 0 && (
                    <optgroup label="Games">
                      {hub.games.map((g) => (
                        <option key={g.id} value={`g:${g.id}`}>
                          {gameLabel(g)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1">
                  <label htmlFor="clip-name" className="block text-xs font-medium text-slate-600">
                    Your first name
                  </label>
                  <input id="clip-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="w-40 rounded-md border border-slate-300 px-2 py-2 text-sm" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <label htmlFor="clip-caption" className="block text-xs font-medium text-slate-600">
                    Caption (optional)
                  </label>
                  <input id="clip-caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder="e.g. Goal in the 2nd half" className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*,.mp4,.mov,.m4v,.webm"
                  multiple
                  disabled={busy}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length > 0) void upload(files);
                  }}
                  className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-orange file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
                <p className="text-xs text-slate-500">
                  Videos up to {MAX_CLIP_BYTES / MB} MB each. The upload starts as soon as you choose the file(s). <strong className="text-amber-900">Deleted automatically {CLIP_LIFETIME_DAYS} days after upload.</strong>
                </p>
              </div>
              {message && <p className="text-sm text-red-600">{message}</p>}
              {rows.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {rows.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-slate-700">{r.name}</span>
                      <span className={cn("shrink-0 text-xs", r.state === "error" ? "text-red-600" : r.state === "done" ? "text-green-700" : "text-slate-500")}>
                        {r.state === "error" ? r.error : r.state === "done" ? "Uploaded" : r.state === "uploading" ? `${r.percent}%` : "Waiting"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">No clips yet. Be the first to share one.</p>
      ) : (
        groups.map((g) => (
          <CollapsibleGroup
            key={g.key}
            title={g.title}
            count={g.clips.length}
            countLabel="clip"
            open={openKeys.has(g.key)}
            onToggle={() =>
              setOpenKeys((prev) => {
                const next = new Set(prev);
                if (next.has(g.key)) next.delete(g.key);
                else next.add(g.key);
                return next;
              })
            }
          >
            <ul className="divide-y divide-slate-100">
              {g.clips.map((c) => (
                <ClipRow key={c.id} clip={c} token={token} pin={pin} />
              ))}
            </ul>
          </CollapsibleGroup>
        ))
      )}
    </section>
  );
}
