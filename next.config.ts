import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The admin guides (content/guides) are read from disk by /api/guides/[name]; make sure the
  // production build ships them with that route.
  outputFileTracingIncludes: {
    "/api/guides/[name]": ["./content/guides/**/*"],
  },
  // The coach guides were renamed when the guides were split into coach and admin sets.
  async redirects() {
    return [
      { source: "/guides/quick-start-guide.pdf", destination: "/guides/coach-quick-start.pdf", permanent: true },
      { source: "/guides/new-coach-guide.pdf", destination: "/guides/coach-guide.pdf", permanent: true },
    ];
  },
};

export default nextConfig;
