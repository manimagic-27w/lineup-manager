"use client";

import { useOrganization } from "@clerk/nextjs";

/**
 * A plain, non-interactive replacement for Clerk's <OrganizationSwitcher/>. Clerk's prebuilt
 * switcher always offers a "Create organization" action and a "Manage" action that lets a
 * member view their membership and leave the organization - neither of which should be
 * available here, and there's no documented prop or appearance selector to hide just those
 * two actions (the same gap we hit with <OrganizationList/> on the choose-a-club screen).
 * Coaches only ever belong to one club in practice, so this just shows that club's name.
 */
export function OrgBadge() {
  const { organization, isLoaded } = useOrganization();

  if (!isLoaded || !organization) return null;

  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900">
      {organization.name}
    </span>
  );
}
