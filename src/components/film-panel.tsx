"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completePart, deleteFilm, finishFilm, getFilmDownloadUrl, getPartUploadUrl, startFilmUpload } from "@/actions/film";
import { MAX_FILM_BYTES, estimateParts, formatBytes, formatRemaining } from "@/lib/film-plan";
import { splitFilm } from "@/lib/film-split";
import { cn } from "@/lib/utils";

export type FilmView = {
  id: string;
  filename: string;
  status: "uploading" | "ready";
  partCount: number;
  originalBytes: number;
  expiresAtMs: number | null;
  parts: { partNo: number; bytes: number }[];
};

/** Sends one clip straight to storage, reporting progress. */
function putToStorage(url: string, body: Blob, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "video/mp4");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage refused the upload (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("The connection dropped while uploading."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export function FilmPanel({ teamId, gameId, configured, film }: { teamId: string; gameId: string; configured: boolean; film: FilmView | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [retryFile, setRetryFile] = useState<File | null>(null); // set when splitting failed, to offer a one-file upload
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Countdown, and a refresh the moment the film expires so the page drops it.
  useEffect(() => {
    if (!film?.expiresAtMs) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [film?.expiresAtMs]);
  useEffect(() => {
    if (film?.expiresAtMs && now >= film.expiresAtMs) router.refresh();
  }, [now, film?.expiresAtMs, router]);

  // Leaving the page mid-upload would lose it.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function upload(file: File, split: boolean) {
    setError("");
    setRetryFile(null);
    setBusy(true);
    setPercent(0);
    const controller = new AbortController();
    abortRef.current = controller;
    let filmId = "";
    try {
      setStatus("Starting…");
      const started = await startFilmUpload({ teamId, gameId, filename: file.name, bytes: file.size });
      if (!started.ok) throw new Error(started.error);
      filmId = started.filmId;
      const expectedParts = estimateParts(file.size);
      let sent = 0;

      const sendPart = async (body: Blob, partNo: number) => {
        for (let attempt = 1; ; attempt++) {
          try {
            const link = await getPartUploadUrl(teamId, filmId, partNo);
            if (!link.ok) throw new Error(link.error);
            setStatus(`Uploading clip ${partNo} of about ${Math.max(expectedParts, partNo)}…`);
            await putToStorage(link.url, body, (loaded) => setPercent(Math.min(99, Math.round(((sent + loaded) / file.size) * 100))), controller.signal);
            const done = await completePart(teamId, filmId, partNo);
            if (!done.ok) throw new Error(done.error);
            sent += body.size;
            return;
          } catch (e) {
            if (controller.signal.aborted || attempt >= 3) throw e;
            setStatus(`Clip ${partNo} didn't go through - trying again…`);
          }
        }
      };

      let count: number;
      if (split) {
        count = await splitFilm(file, {
          signal: controller.signal,
          onStatus: (s) => s.stage !== "cutting" && setStatus(s.message),
          onClip: async (clip, partNo) => {
            // Copy into a Blob so the clip's memory can be released as soon as it is sent.
            await sendPart(new Blob([clip as BlobPart], { type: "video/mp4" }), partNo);
          },
        });
      } else {
        await sendPart(file, 1);
        count = 1;
      }

      setStatus("Finishing…");
      const finished = await finishFilm(teamId, filmId, count);
      if (!finished.ok) throw new Error(finished.error);
      setStatus("");
      setPercent(100);
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "The upload failed.";
      setError(message);
      setRetryFile(split && !controller.signal.aborted ? file : null);
      if (filmId) await deleteFilm(teamId, filmId).catch(() => {});
      router.refresh();
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILM_BYTES) return setError("That file is bigger than 4 GB, which is the most we can take.");
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v)$/i.test(file.name)) return setError("Choose a video file (MP4 or MOV).");
    if (film && !window.confirm("This game already has film uploaded. Uploading a new one erases it. Continue?")) return;
    void upload(file, true);
  }

  async function download(partNo: number) {
    if (!film) return;
    const res = await getFilmDownloadUrl(teamId, film.id, partNo);
    if (!res.ok) {
      setError(res.error);
      router.refresh();
      return;
    }
    window.location.assign(res.url); // the link makes the browser download rather than play
  }

  async function downloadAll() {
    if (!film) return;
    for (const p of film.parts) {
      await download(p.partNo);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async function eraseAll() {
    if (!film) return;
    if (!window.confirm("Delete all film files from the server now? This can't be undone.")) return;
    setBusy(true);
    await deleteFilm(teamId, film.id);
    setBusy(false);
    router.refresh();
  }

  const button = "rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-60";

  if (!configured) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Game film download</h2>
        <p className="mt-1 text-sm text-slate-500">Film upload isn&apos;t set up for this app yet.</p>
      </section>
    );
  }

  const ready = film?.status === "ready" && film.expiresAtMs && film.expiresAtMs > now;

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Game film download</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload the whole game once. It&apos;s cut into clips of about 200 MB that anyone on the team can download, then everything is erased after 24 hours.
        </p>
      </div>

      {busy ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">{status}</p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand-orange transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-slate-500">Keep this tab open until it finishes. A 2 GB game takes several minutes.</p>
          <button type="button" onClick={() => abortRef.current?.abort()} className={button}>
            Cancel
          </button>
        </div>
      ) : ready && film ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-700">
              <strong>{film.filename}</strong> &middot; {film.partCount} download{film.partCount === 1 ? "" : "s"} &middot;{" "}
              <span className="text-amber-700">erased in {formatRemaining(film.expiresAtMs! - now)}</span>
            </p>
            <div className="flex gap-2">
              {film.partCount > 1 && (
                <button type="button" onClick={downloadAll} className={button}>
                  Download all
                </button>
              )}
              <button type="button" onClick={eraseAll} className={cn(button, "text-red-700")}>
                Delete all files now
              </button>
            </div>
          </div>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {film.parts.map((p) => (
              <li key={p.partNo} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-slate-800">
                  Part {p.partNo} of {film.partCount} <span className="text-slate-400">&middot; {formatBytes(p.bytes)}</span>
                </span>
                <button type="button" onClick={() => download(p.partNo)} className="rounded-md bg-brand-orange px-3 py-1 text-sm font-semibold text-white hover:bg-brand-orange-light">
                  Download
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            Each part plays on its own. Parts overlap by a second or two where they join. To replace this film, upload a new one below.
          </p>
        </div>
      ) : film?.status === "uploading" ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>An upload from earlier didn&apos;t finish.</span>
          <button type="button" onClick={eraseAll} className={button}>
            Clear it
          </button>
        </div>
      ) : null}

      {!busy && (
        <div className="space-y-2">
          <input ref={inputRef} type="file" accept="video/*,.mp4,.mov,.m4v" onChange={pick} className="hidden" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-brand-orange px-4 py-2 text-sm font-semibold text-white hover:bg-brand-orange-light"
          >
            {ready ? "Upload a different film" : "Upload game film"}
          </button>
          <p className="text-xs text-slate-500">Use a computer. Your browser cuts the film into clips before sending them, so the film itself never loads into memory. MP4 or MOV, up to 4 GB.</p>
        </div>
      )}

      {error && (
        <div className="space-y-2">
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
          {retryFile && (
            <button type="button" onClick={() => upload(retryFile, false)} className={button}>
              Upload as one file instead
            </button>
          )}
        </div>
      )}
    </section>
  );
}
