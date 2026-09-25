"use client";

/**
 * Opens the print sheet in an actual popup window (via window.open's feature string) rather
 * than a new tab, so it reads as a quick "print this" action instead of navigating the coach
 * away to a whole new page.
 */
export function PrintLineupButton({ href }: { href: string }) {
  function openPopup() {
    window.open(
      href,
      "printLineupSheet",
      "width=900,height=700,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes"
    );
  }

  return (
    <button
      type="button"
      onClick={openPopup}
      className="inline-flex items-center justify-center rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200"
    >
      Print lineup sheet
    </button>
  );
}
