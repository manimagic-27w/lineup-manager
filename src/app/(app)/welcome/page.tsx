import { requireOrgSession } from "@/lib/auth";
import { WelcomeTips } from "@/components/welcome-tips";

export default async function WelcomePage() {
  await requireOrgSession();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <WelcomeTips />
    </div>
  );
}
