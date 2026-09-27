"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center justify-center rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-orange-light"
    >
      Print
    </button>
  );
}
