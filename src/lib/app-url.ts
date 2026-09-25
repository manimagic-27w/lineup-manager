/**
 * Base URL of this deployment, for links that need to point back into the app from somewhere
 * outside it - currently just Clerk organization invitation emails (see
 * `inviteOrgMember` in `src/actions/coaches.ts`). Without an explicit `redirectUrl`, Clerk sends
 * invited coaches to its own generic hosted Account Portal instead of back into this app, so
 * every invitation needs this.
 *
 * Prefers an explicit override (set NEXT_PUBLIC_APP_URL if you're on a custom domain), falls
 * back to the stable production URL Vercel provides automatically, then to whatever URL the
 * current deployment happens to be on, and finally to localhost for local dev.
 */
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
