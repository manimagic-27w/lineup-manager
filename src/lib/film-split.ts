// Browser-only: cuts a game film into playable ~200 MB clips without re-encoding, then hands each
// clip to `onClip` (which uploads it) before cutting the next, so only one clip is in memory at a
// time. Uses ffmpeg compiled to WebAssembly, loaded from /ffmpeg (small files in public/) plus the
// 32 MB engine from a CDN. The film itself is never copied into memory: ffmpeg reads it straight
// from the File the coach chose.
import { MAX_CLIP_BYTES, fileExtension, nextClipSeconds, parseDurationSeconds, shrinkSeconds } from "@/lib/film-plan";

const CORE_VERSION = "0.12.10"; // must match public/ffmpeg/ffmpeg-core.js
const WASM_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.wasm`;

type FFmpegInstance = {
  load(opts: { coreURL: string; wasmURL: string }): Promise<boolean>;
  exec(args: string[], timeout?: number): Promise<number>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<boolean>;
  createDir(path: string): Promise<boolean>;
  mount(fsType: string, options: { files?: File[] }, mountPoint: string): Promise<boolean>;
  unmount(mountPoint: string): Promise<boolean>;
  on(event: "log", cb: (e: { message: string }) => void): void;
  off(event: "log", cb: (e: { message: string }) => void): void;
  terminate(): void;
};
type FFmpegCtor = new () => FFmpegInstance;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Couldn't load the video tools."));
    document.head.appendChild(el);
  });
}

async function blobUrl(url: string, type: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't download the video tools.");
  return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type }));
}

export type SplitStatus = { stage: "loading" | "reading" | "cutting" | "done"; partNo?: number; message: string };

export type SplitOptions = {
  /** Called with each finished clip; resolves when it's safely uploaded. */
  onClip: (clip: Uint8Array, partNo: number) => Promise<void>;
  onStatus?: (s: SplitStatus) => void;
  signal?: AbortSignal;
  /** Where the video tools live (tests point this somewhere else). */
  toolsBase?: string;
  wasmUrl?: string;
};

/** Cuts `file` into clips and passes each to onClip. Returns how many clips there were. */
export async function splitFilm(file: File, opts: SplitOptions): Promise<number> {
  const status = opts.onStatus ?? (() => {});
  const base = opts.toolsBase ?? `${window.location.origin}/ffmpeg`;

  status({ stage: "loading", message: "Loading video tools (first time only)…" });
  const w = window as unknown as { FFmpegWASM?: { FFmpeg: FFmpegCtor } };
  if (!w.FFmpegWASM) await loadScript(`${base}/ffmpeg.js`);
  if (!w.FFmpegWASM) throw new Error("Couldn't start the video tools.");
  const ffmpeg = new w.FFmpegWASM.FFmpeg();
  await ffmpeg.load({
    coreURL: await blobUrl(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await blobUrl(opts.wasmUrl ?? WASM_URL, "application/wasm"),
  });

  try {
    const ext = fileExtension(file.name);
    const inputName = `input.${ext}`;
    // Same bytes, new name, no copy: ffmpeg reads the original file in place.
    await ffmpeg.createDir("/input");
    await ffmpeg.mount("WORKERFS", { files: [new File([file], inputName, { type: file.type })] }, "/input");
    const input = `/input/${inputName}`;

    status({ stage: "reading", message: "Reading the film…" });
    let log = "";
    const onLog = (e: { message: string }) => {
      log += `${e.message}\n`;
    };
    ffmpeg.on("log", onLog);
    await ffmpeg.exec(["-hide_banner", "-i", input]); // prints the film's length, then stops
    ffmpeg.off("log", onLog);
    const duration = parseDurationSeconds(log);
    if (!duration) throw new Error("Couldn't read this video. Is it an MP4 or MOV file?");

    let bytesPerSec = file.size / duration;
    let start = 0;
    let partNo = 0;
    while (start < duration - 0.5) {
      if (opts.signal?.aborted) throw new Error("Upload cancelled.");
      partNo++;
      let seconds = nextClipSeconds(bytesPerSec, duration - start);
      let clip: Uint8Array | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        status({ stage: "cutting", partNo, message: `Cutting clip ${partNo}…` });
        await ffmpeg.exec([
          "-ss", String(start), "-i", input, "-t", String(seconds),
          "-map", "0:v:0", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero",
          "clip.mp4",
        ]);
        const data = await ffmpeg.readFile("clip.mp4");
        await ffmpeg.deleteFile("clip.mp4");
        if (typeof data === "string" || data.length === 0) throw new Error("Couldn't cut this video. Try uploading it as one file.");
        // A clip over the limit is cut again, shorter (copy-cutting lands on keyframes, so sizes vary).
        if (data.length > MAX_CLIP_BYTES && attempt < 3) {
          seconds = shrinkSeconds(seconds, data.length);
          continue;
        }
        clip = data;
        break;
      }
      if (!clip) throw new Error("Couldn't cut this video into small enough clips.");
      const covered = Math.min(seconds, duration - start);
      bytesPerSec = clip.length / Math.max(covered, 1);
      await opts.onClip(clip, partNo);
      start += seconds;
    }
    status({ stage: "done", message: "Done" });
    return partNo;
  } finally {
    ffmpeg.terminate();
  }
}
