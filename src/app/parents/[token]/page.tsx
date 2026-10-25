import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { ParentApprovalClient } from "@/components/parent-approval-client";
import { getTeamByParentToken, listActiveLogRoster } from "@/lib/training-log-server";

// A public page for parents: the secret link plus the parent's own phone number are the credentials.
export const metadata: Metadata = {
  title: "Approve training time - Lineup Manager",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ParentApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const team = await getTeamByParentToken(token);
  if (!team) notFound();
  const roster = await listActiveLogRoster(team.id);

  return (
    <div className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      <div className="mb-6 text-center">
        <Logo className="text-3xl" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{team.name}</h1>
        <p className="mt-1 text-sm text-slate-600">Parents: approve the training time your child has logged.</p>
      </div>
      <ParentApprovalClient token={token} roster={roster} />
    </div>
  );
}
