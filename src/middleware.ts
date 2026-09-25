import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`, but `middleware.ts`
// still works (deprecated, not removed) and this is what Clerk's Next.js SDK documents as of
// this build, so we keep the familiar name here rather than fighting an unreleased rename.

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isSelectOrgRoute = createRouteMatcher(["/select-org(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { orgId } = await auth.protect();

  // Signed in, but hasn't picked (or created) a club yet - Clerk Organizations map 1:1 to
  // clubs, so every authenticated screen past this point assumes an active org is set.
  if (!orgId && !isSelectOrgRoute(req)) {
    return NextResponse.redirect(new URL("/select-org", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
