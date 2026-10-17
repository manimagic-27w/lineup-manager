import Link from "next/link";
import { isCurrentUserPlatformAdmin } from "@/lib/platform";
import { SelectOrgClient } from "@/components/select-org-client";

export default async function SelectOrgPage() {
  const isPlatformAdmin = await isCurrentUserPlatformAdmin();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 px-4">
      <SelectOrgClient />
      {isPlatformAdmin && (
        <Link href="/platform" className="text-sm font-medium text-brand-blue hover:underline">
          Platform admin &rarr;
        </Link>
      )}
    </div>
  );
}
