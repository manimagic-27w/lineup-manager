import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { TrainingLogClient } from "@/components/training-log-client";
import { getTeamByLogToken, listActiveLogRoster } from "@/lib/training-log-server";

// A public page: anyone with the team's secret link can open it, so keep it out of search engines.
export const metadata: Metadata = {
  title: "Log your training - Lineup Manager",
  robots: { index: false, follow: false },
};

export default async function PlayerLogPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const team = await getTeamByLogToken(token);
  if (!team) notFound();
  const roster = await listActiveLogRoster(team.id);

  return (
    <div className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      <div className="mb-6 text-center">
        <Logo className="text-3xl" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{team.name}</h1>
        <p className="mt-1 text-sm text-slate-600">Log the time you put in outside of practice.</p>
      </div>
      <TrainingLogClient token={token} roster={roster} />
    </div>
  );
}
