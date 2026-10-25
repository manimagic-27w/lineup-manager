"use client";

import { useState, useTransition } from "react";
import { approveDay } from "@/actions/training-approval";

export function ApproveButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (result?.ok) return <p className="text-sm font-medium text-green-700">{result.text}</p>;

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const res = await approveDay(token);
              setResult(res.ok ? { ok: true, text: "Approved - thank you! You can close this page." } : { ok: false, text: res.error });
            } catch {
              setResult({ ok: false, text: "Couldn't approve - check your signal and try again." });
            }
          })
        }
        className="w-full rounded-md bg-brand-orange px-4 py-3 text-base font-semibold text-white hover:bg-brand-orange-light disabled:opacity-60"
      >
        {pending ? "Approving…" : "Approve"}
      </button>
      {result && !result.ok && <p className="mt-2 text-sm text-red-600">{result.text}</p>}
    </div>
  );
}
