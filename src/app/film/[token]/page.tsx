import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

  return (
    <div className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      <div className="mb-6 text-center">
        <Logo className="text-3xl" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{team.name}</h1>
        <p className="mt-1 text-sm text-slate-600">Game video</p>
      </div>
      <FilmIndexClient token={token} teamName={team.name} />
    </div>
  );
}
