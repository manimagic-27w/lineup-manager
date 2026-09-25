import { OrganizationList } from "@clerk/nextjs";

export default function SelectOrgPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Choose a club</h1>
        <p className="mt-1 text-slate-600">
          Pick the club you coach for, or create a new one to get started.
        </p>
      </div>
      <OrganizationList hidePersonal afterSelectOrganizationUrl="/" afterCreateOrganizationUrl="/" />
    </div>
  );
}
