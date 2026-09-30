"use client";

import { useEffect, useRef, useState } from "react";
import { useOrganization, useOrganizationList } from "@clerk/nextjs";

/**
 * Replaces the old static OrgBadge. Clerk's prebuilt <OrganizationSwitcher/> always offers a
 * "Create organization" action and a "Manage" action that lets a member view their membership
 * and leave the organization - neither of which should be available here, and there's no
 * documented prop or appearance selector to hide just those two actions (the same gap we hit
 * with <OrganizationList/> on the choose-a-club screen). This hand-rolls just what we need:
 * the current club's name, and - only for coaches who actually belong to more than one club
 * (most belong to exactly one) - a dropdown to switch between them.
 */
export function OrgSwitcher() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { isLoaded: listLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const [isOpen, setIsOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  if (!orgLoaded || !organization) return null;

  const memberships = userMemberships.data ?? [];
  const canSwitch = listLoaded && userMemberships.count > 1;

  if (!canSwitch) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900">
        {organization.name}
      </span>
    );
  }

  function switchTo(organizationId: string) {
    if (!setActive || organizationId === organization?.id) {
      setIsOpen(false);
      return;
    }
    setSwitchingId(organizationId);
    setActive({ organization: organizationId })
      .then(() => {
        // Hard navigation: the server needs the session cookie to carry the new org before
        // requireOrgSession() will allow it through, and that can lag just behind a soft
        // client-side navigation. A full reload guarantees a fresh request picks it up.
        window.location.href = "/";
      })
      .catch(() => setSwitchingId(null));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {organization.name}
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <ul className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {memberships.map((membership) => {
            const isCurrent = membership.organization.id === organization.id;
            return (
              <li key={membership.id}>
                <button
                  type="button"
                  disabled={switchingId !== null}
                  onClick={() => switchTo(membership.organization.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="truncate">
                    {switchingId === membership.organization.id ? "Switching…" : membership.organization.name}
                  </span>
                  {isCurrent && <span className="text-brand-blue">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
