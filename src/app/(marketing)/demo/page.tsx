import type { Metadata } from "next";
import { DemoTour } from "@/components/marketing/demo-tour";
import { stepIndexFromParam } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Demo - Lineup Manager",
  description: "Click through a preview of Lineup Manager with sample data.",
};

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const { step } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">See how it works</h1>
        <p className="mt-1 text-sm text-slate-600">
          A click-through preview of the real screens, with made-up players. Pick a step, or use Next.
        </p>
      </div>
      <DemoTour initialStep={stepIndexFromParam(step)} />
    </div>
  );
}
