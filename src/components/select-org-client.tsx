"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OrganizationList, useOrganizationList } from "@clerk/nextjs";

/**
 * Coaches only ever belong to one club in practice - the invite flow is a club admin adding
 * them to their one club. Clerk's <OrganizationList/> always shows a pick screen regardless of
 * membership count, so this skips it: the moment we know the signed-in user has exactly one
 * membership, we activate it ourselves and redirect straight into the app - the picker never
 * renders. Anyone with zero or more than one membership still sees the normal list.
 */
export function SelectOrgClient() {
  const router = useRouter();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: true,
  });
  const [activationFailed, setActivationFailed] = useState(false);

  const ready = isLoaded && !userMemberships.isLoading;
  const soleMembership =
    ready && !activationFailed && userMemberships.count === 1 ? userMemberships.data?.[0] : undefined;

  useEffect(() => {
    if (!soleMembership || !setActive) return;
    setActive({ organization: soleMembership.organization.id })
      .then(() => router.replace("/"))
      .catch(() => setActivationFailed(true));
  }, [soleMembership, setActive, router]);

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
      <OrganizationList hidePersonal afterSelectOrganizationUrl="/" afterCreateOrganizationUrl="/" />
    </>
  );
}
