import { StatsSubnav } from "@/components/stats-subnav";

export default async function StatsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return (
    <>
      <StatsSubnav teamId={teamId} />
      {children}
    </>
  );
}
