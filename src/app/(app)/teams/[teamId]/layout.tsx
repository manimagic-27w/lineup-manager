import { requireTeamAccess } from "@/lib/auth";
import { TeamNav } from "@/components/team-nav";
import { OfflineSync } from "@/components/offline-sync";
import { clubHasFeature } from "@/lib/features";
import { themeSwatch } from "@/lib/utils";

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const { team, orgId } = await requireTeamAccess(teamId);
  const showPractices = await clubHasFeature(orgId, "practice_plans");

  return (
    <div className="flex flex-1 flex-col">
      <div
        className="border-b border-slate-200 bg-white px-4 pt-4 sm:px-6 print:hidden"
        style={{ borderTopColor: themeSwatch(team.theme), borderTopWidth: 4 }}
      >
        <h1 className="text-xl font-semibold text-slate-900">{team.name}</h1>
        <OfflineSync teamId={teamId} />
        <TeamNav teamId={teamId} showPractices={showPractices} />
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
