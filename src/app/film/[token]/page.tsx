import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Logo } from "@/components/logo";
import { FilmIndexClient } from "@/components/film-index-client";
import { getTeamByFilmIndexToken } from "@/lib/film-index-server";

// A public page: anyone with the team's secret link can open it, but no games are shown without
// the PIN. Keep it out of search engines.
export const metadata: Metadata = {
  title: "Game video - Lineup Manager",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function FilmIndexPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const team = await getTeamByFilmIndexToken(token);
  if (!team) notFound();
  // A coach who is signed in gets a way back into the app. Parents (not signed in) see nothing extra.
  // Without it a coach who opens this page from the home-screen app has no way to leave it.
  const { userId } = await auth();

  return (
    <div className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      {userId && (
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-brand-blue hover:bg-slate-200"
        >
          &larr; Back to Lineup Manager
        </Link>
      )}
      <div className="mb-6 text-center">
        <Logo className="text-3xl" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{team.name}</h1>
        <p className="mt-1 text-sm text-slate-600">Game video</p>
      </div>
      <FilmIndexClient token={token} teamName={team.name} />
    </div>
  );
}
