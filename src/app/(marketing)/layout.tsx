import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Logo } from "@/components/logo";
import { REQUEST_ACCESS_HREF } from "@/lib/marketing";

/** Public shell for the front page and demo - no club or team context needed. */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Lineup Manager home">
            <Logo className="text-xl sm:text-2xl" />
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/demo" className="text-slate-600 hover:text-brand-blue">
              Demo
            </Link>
            {userId ? (
              <Link
                href="/"
                className="rounded-md bg-brand-orange px-3 py-1.5 text-white hover:bg-brand-orange-light"
              >
                Open the app
              </Link>
            ) : (
              <Link
                href="/sign-in"
                className="rounded-md bg-brand-orange px-3 py-1.5 text-white hover:bg-brand-orange-light"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:px-6">
          <span>Lineup Manager for lacrosse clubs</span>
          <span className="flex gap-4">
            <Link href="/guides/coach-quick-start.pdf" target="_blank" rel="noopener noreferrer" className="hover:text-brand-blue">
              Coaches quick start
            </Link>
            <a href={REQUEST_ACCESS_HREF} className="hover:text-brand-blue">
              Request an invite
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
