import type { Metadata } from "next";
import { AudienceHome } from "@/components/marketing/audience-home";
import { audienceFromParam } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Lineup Manager - lineups and availability for lacrosse clubs",
  description:
    "Collect availability, build Field, Sevens and Sixes lineups, track scores and start history, and manage coaches across your club.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string | string[] }>;
}) {
  const { for: audience } = await searchParams;
  return <AudienceHome initialAudience={audienceFromParam(audience)} />;
}
