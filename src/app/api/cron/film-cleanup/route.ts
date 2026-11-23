import { NextResponse } from "next/server";
import { purgeExpiredFilms } from "@/lib/film-storage";
import { purgeExpiredClips } from "@/lib/clip-storage";

// Runs daily from vercel.json. Vercel sends "Authorization: Bearer <CRON_SECRET>". Film is already
// refused for download after 24 hours; this is what actually erases the files (the R2 bucket's
// 1-day lifecycle rule is a second safety net).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const erased = await purgeExpiredFilms();
  // Parent clips are erased 60 days after upload (and abandoned uploads after a day).
  const clipsErased = await purgeExpiredClips();
  return NextResponse.json({ erased, clipsErased });
}
