"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrganizationList } from "@clerk/nextjs";

/**
 * A hand-rolled replacement for Clerk's <OrganizationList/> on this one screen. Clerk's
 * "Allow user-created organizations" dashboard setting blocks the create action server-side,
 * but their prebuilt component still renders the "Create organization" button regardless of
 * that setting - there's no documented prop to hide just that button. Building the list
 * ourselves from the same membership data sidesteps that entirely: there is no create option
 * here because we never render one.
 *
 * Coaches only ever belong to one club in practice, so on top of that: the moment we know the
 * signed-in user has exactly one membership, we activate it ourselves and redirect straight
 * into the app, skipping this screen altogether. Anyone with zero or more than one membership
 * sees the list below instead.
 */
export function SelectOrgClient() {
  const router = useRouter();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: true,
  });
  const [activationFailed, setActivationFailed] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const ready = isLoaded && !userMemberships.isLoading;
  const soleMembership =
    ready && !activationFailed && userMemberships.count === 1 ? userMemberships.data?.[0] : undefined;

  useEffect(() => {
    if (!soleMembership || !setActive) return;
    setActive({ organization: soleMembership.organization.id })
      .then(() => router.replace("/"))
      .catch(() => setActivationFailed(true));
  }, [soleMembership, setActive, router]);

  function selectOrg(organizationId: string) {
    if (!setActive) return;
    setJoiningId(organizationId);
    setActive({ organization: organizationId })
      .then(() => router.replace("/"))
      .catch(() => setJoiningId(null));
  }

  if (!ready || soleMembership) {
    return <p className="py-16 text-center text-sm text-slate-500">Loading your club…</p>;
  }

  return (
    <>
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Choose a club</h1>
        <p className="mt-1 text-slate-600">
          {userMemberships.count === 0
            ? "You haven't been added to a club yet. Ask your club admin to invite you."
            : "Pick the club you coach for."}
        </p>
      </div>

      {userMemberships.count > 0 && (
        <ul className="w-full max-w-sm space-y-2">
          {userMemberships.data?.map((membership) => (
            <li key={membership.id}>
              <button
                type="button"
                disabled={joiningId !== null}
                onClick={() => selectOrg(membership.organization.id)}
                className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left font-medium text-slate-900 shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                {joiningId === membership.organization.id ? "Joining…" : membership.organization.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
