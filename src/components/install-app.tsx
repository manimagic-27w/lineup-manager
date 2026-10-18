"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Kind = "ios" | "other";

/**
 * "Put Lineup Manager on your phone" card for the Getting started page. Hidden once the app is
 * already running installed. Chrome and Edge offer a real Install button; iPhone and iPad have no
 * such button, so it shows the Share-sheet steps instead.
 */
export function InstallApp() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setInstalled(standalone);
      setKind(/iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "other");
    }, 0);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!kind || installed) return null;

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-slate-900">Put Lineup Manager on your phone</h2>
      <p className="mt-1 text-sm text-slate-600">
        Add it to your home screen to open it like an app, full screen, with your saved game-day info ready when the
        signal is bad.
      </p>
      {prompt ? (
        <button
          type="button"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice.catch(() => undefined);
            setPrompt(null);
          }}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange-light"
        >
          Install app
        </button>
      ) : kind === "ios" ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Open this page in Safari.</li>
          <li>Tap the Share button (the square with an arrow) at the bottom of the screen.</li>
          <li>Scroll down and tap &ldquo;Add to Home Screen,&rdquo; then tap Add.</li>
        </ol>
      ) : (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Open the browser menu (the three dots).</li>
          <li>Tap &ldquo;Install app&rdquo; or &ldquo;Add to Home screen.&rdquo;</li>
        </ol>
      )}
    </div>
  );
}
