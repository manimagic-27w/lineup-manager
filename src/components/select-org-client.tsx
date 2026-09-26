"use client";

import { useEffect, useState } from "react";
import { useOrganizationList } from "@clerk/nextjs";

/**
 * A hand-rolled replacement for Clerk's <OrganizationList/> on this one screen. Clerk's
 * "Allow user-created organizations" dashboard setting blocks the create action server-side,
 * but their prebuilt component still renders the "Create organization" button regardless of
 * that setting - there's no documented prop to hide just that button. Building the list
 * ourselves from the same membership data sidesteps that entirely: there is no create option
 * here because we never render one.
 *
 * A newly invited coach isn't a member yet - they have a pending *invitation* until they
 * accept it, which is a separate thing from userMemberships. So this also fetches
 * userInvitations and, for the common case of exactly one pending invite and no memberships
 * yet, accepts it automatically.
 *
 * Coaches only ever belong to one club in practice, so on top of that: the moment we know the
 * signed-in user has exactly one membership, we activate it ourselves and redirect straight
 * into the app, skipping this screen altogether. Anyone with zero or more than one membership
 * (and no single pending invitation to auto-accept) sees the list below instead.
 */
export function SelectOrgClient() {
  const { isLoaded, setActive, userMemberships, userInvitations } = useOrganizationList({
    userMemberships: { infinite: true },
    userInvitations: { infinite: true },
  });
  const [activationFailed, setActivationFailed] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const ready = isLoaded && !userMemberships.isLoading && !userInvitations.isLoading;
  const soleMembership =
    ready && !activationFailed && userMemberships.count === 1 ? userMemberships.data?.[0] : undefined;
  const soleInvitation =
    ready && !activationFailed && !soleMembership && userMemberships.count === 0 && userInvitations.count === 1
      ? userInvitations.data?.[0]
      : undefined;

  function goIn() {
    // Hard navigation, not router.replace: the server needs the session cookie to actually
    // carry the new org before requireOrgSession() will let it through, and that can lag
    // just behind a soft client-side navigation, bouncing the user right back to this
    // screen. A full reload guarantees a fresh request picks up the updated cookie.
    window.location.href = "/";
  }

  useEffect(() => {
    if (!soleMembership || !setActive) return;
    setActive({ organization: soleMembership.organization.id }).then(goIn).catch(() => setActivationFailed(true));
  }, [soleMembership, setActive]);

  useEffect(() => {
    if (!soleInvitation || !setActive) return;
    soleInvitation
      .accept()
      .then(() => setActive({ organization: soleInvitation.publicOrganizationData.id }))
      .then(goIn)
      .catch(() => setActivationFailed(true));
  }, [soleInvitation, setActive]);

  function selectOrg(organizationId: string) {
    if (!setActive) return;
    setJoiningId(organizationId);
    setActive({ organization: organizationId }).then(goIn).catch(() => setJoiningId(null));
  }

  function acceptInvitation(invitation: NonNullable<typeof userInvitations.data>[number]) {
    setJoiningId(invitation.id);
    invitation
      .accept()
      .then(() => setActive?.({ organization: invitation.publicOrganizationData.id }))
      .then(goIn)
      .catch(() => setJoiningId(null));
  }

  if (!ready || soleMembership || soleInvitation) {
    return <p className="py-16 text-center text-sm text-slate-500">Loading your club…</p>;
  }

  const hasAnyOptions = userMemberships.count > 0 || userInvitations.count > 0;

  return (
    <>
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Choose a club</h1>
        <p className="mt-1 text-slate-600">
          {hasAnyOptions
            ? "Pick the club you coach for."
            : "You haven't been added to a club yet. Ask your club admin to invite you."}
        </p>
      </div>

      {hasAnyOptions && (
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
          {userInvitations.data?.map((invitation) => (
            <li key={invitation.id}>
              <button
                type="button"
                disabled={joiningId !== null}
                onClick={() => acceptInvitation(invitation)}
                className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left font-medium text-slate-900 shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                {joiningId === invitation.id ? "Joining…" : invitation.publicOrganizationData.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
