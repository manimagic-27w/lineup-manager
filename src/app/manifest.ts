import type { MetadataRoute } from "next";

// Makes the site installable ("Add to Home Screen" on iPhone and Android, "Install" in Chrome).
// Served at /manifest.webmanifest; the icons live in public/icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Lineup Manager",
    short_name: "Lineups",
    description: "Rosters, availability, lineups and practice plans for lacrosse clubs.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#232d4b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
