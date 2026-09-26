import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/logo";
import { OrgBadge } from "@/components/org-badge";
import { requireOrgSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOrgSession();
  const isAdmin = session.has({ role: "org:admin" });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Lineup Manager home">
            <Logo className="text-xl sm:text-2xl" />
          </Link>
          <OrgBadge />
        </div>
        <div className="flex items-center gap-4">
          <Link href="/welcome" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Getting started
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Admin
            </Link>
          )}
          <UserButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
