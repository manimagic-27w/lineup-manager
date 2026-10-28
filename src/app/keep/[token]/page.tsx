import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { StatKeeperClient } from "@/components/stat-keeper-client";
import { getTeamByKeeperToken } from "@/lib/stat-keeper-server";

// A public page: anyone with the team's secret link can open it, but nothing is shown or changed
// without the keeper PIN. Keep it out of search engines.
export const metadata: Metadata = {
  title: "Stat keeper - Lineup Manager",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function StatKeeperPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const team = await getTeamByKeeperToken(token);
  if (!team) notFound();

  return (
    <div className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
      <div className="mb-5 text-center">
        <Logo className="text-2xl" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">{team.name} &ndash; stat keeper</h1>
      </div>
      <StatKeeperClient token={token} teamName={team.name} />
    </div>
  );
}
