"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { clearOfflineStore } from "@/lib/offline-storage";

/**
 * Registers the offline service worker (public/sw.js) and removes the saved offline copy when
 * someone signs out. Sign-out is only trusted on the public pages ("/home", "/sign-in"): a flaky
 * connection can make the signed-in state look briefly empty on an app page, and that must never
 * wipe the copy a coach is relying on.
 */
export function OfflineManager() {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    if (!navigator.onLine) return;
    if (pathname === "/" || pathname.startsWith("/home") || pathname.startsWith("/sign-in")) {
      clearOfflineStore();
    }
  }, [isLoaded, isSignedIn, pathname]);

  return null;
}
