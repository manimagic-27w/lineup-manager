import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`, but `middleware.ts`
// still works (deprecated, not removed) and this is what Clerk's Next.js SDK documents as of
// this build, so we keep the familiar name here rather than fighting an unreleased rename.

// /log/<token> is the public player training log (no sign-in; the secret link is the credential).
// /home and /demo are the public front page and demo (see src/app/(marketing)). Signed-out
// visitors who open "/" are shown /home without the URL changing; signed-in users still get the
// dashboard at "/".
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/home(.*)", "/demo(.*)", "/log(.*)", "/approve(.*)"]);
const isRootRoute = createRouteMatcher(["/"]);
const isSelectOrgRoute = createRouteMatcher(["/select-org(.*)"]);
// The platform admin page sits above all clubs, so it works without an active organization.
const isPlatformRoute = createRouteMatcher(["/platform(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  if (isRootRoute(req)) {
    const { userId } = await auth();
    if (!userId) return NextResponse.rewrite(new URL("/home" + req.nextUrl.search, req.url));
  }

  const { orgId } = await auth.protect();

  // Signed in, but hasn't picked (or created) a club yet - Clerk Organizations map 1:1 to
  // clubs, so every authenticated screen past this point assumes an active org is set.
  if (!orgId && !isSelectOrgRoute(req) && !isPlatformRoute(req)) {
    return NextResponse.redirect(new URL("/select-org", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
