import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// Deliberately not using next/font/google here: it fetches from fonts.googleapis.com at build
// time, which fails in network-restricted build environments (locked-down CI, offline dev).
// The system font stack below (see globals.css) looks close enough to Geist without that
// dependency - swap in next/font/google or next/font/local if you'd rather self-host one.

export const metadata: Metadata = {
  title: "Lineup Manager",
  description: "Rosters, availability, lineups and stats for lacrosse clubs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased">
        <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">{children}</body>
      </html>
    </ClerkProvider>
  );
}
