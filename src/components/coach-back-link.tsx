import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

/**
 * On the public no-sign-in pages (stat keeper, training log, parent approval, parents' video
 * page): a signed-in coach gets a way back into the app. Without it a coach who opens one of
 * these from the home-screen app has no way to leave. People who aren't signed in (players,
 * parents, the stat keeper volunteer) see nothing.
 */
export async function CoachBackLink() {
  const { userId } = await auth();
  if (!userId) return null;
  return (
    <Link
      href="/"
      className="mb-4 inline-flex items-center gap-1 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-brand-blue hover:bg-slate-200"
    >
      &larr; Back to Lineup Manager
    </Link>
  );
}
