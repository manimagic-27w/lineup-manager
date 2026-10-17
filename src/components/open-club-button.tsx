"use client";

import { useState } from "react";
import { useOrganizationList } from "@clerk/nextjs";
import { ensureClubAccess } from "@/actions/platform";

/** Switches the platform admin into a club (adding them as a member first if needed). */
export function OpenClubButton({ orgId }: { orgId: string }) {
  const { isLoaded, setActive } = useOrganizationList();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");

  async function open() {
    if (!setActive) return;
    setState("busy");
    const result = await ensureClubAccess(orgId);
    if (!result.ok) {
      setError(result.error ?? "Couldn't open the club.");
      setState("error");
      return;
    }
    try {
      await setActive({ organization: orgId });
      // Hard navigation so the next request carries the new active organization.
      window.location.href = "/";
    } catch {
      setError("Couldn't switch into the club.");
      setState("error");
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={open}
        disabled={!isLoaded || state === "busy"}
        className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {state === "busy" ? "Opening…" : "Open club"}
      </button>
      {state === "error" && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
