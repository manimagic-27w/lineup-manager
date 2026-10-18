import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { OfflineManager } from "@/components/offline-manager";

// Deliberately not using next/font/google here: it fetches from fonts.googleapis.com at build
// time, which fails in network-restricted build environments (locked-down CI, offline dev).
// The system font stack below (see globals.css) looks close enough to Geist without that
// dependency - swap in next/font/google or next/font/local if you'd rather self-host one.
//
// The <link> below is different: it's a runtime stylesheet fetch from the browser, not a
// build-time one, so it doesn't hit the same problem. It loads Anton, the display face the
// <Logo/> wordmark (src/components/logo.tsx) uses in the header.

export const metadata: Metadata = {
  title: "Lineup Manager",
  description: "Rosters, availability, lineups and stats for lacrosse clubs.",
  applicationName: "Lineup Manager",
  // iPhone "Add to Home Screen": its own icon and a title, and it opens without Safari's chrome.
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Lineups", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#232d4b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font -- this rule predates
              the App Router; app/layout.tsx (no pages/_document.js exists here) is the
              documented App Router place for a global font stylesheet. */}
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Anton&display=swap"
          />
        </head>
        <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
          <OfflineManager />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
