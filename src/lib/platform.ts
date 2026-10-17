import "server-only";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { isPlatformAdminId } from "./platform-admin";

/** True when the signed-in user is listed in PLATFORM_ADMIN_USER_IDS. */
export async function isCurrentUserPlatformAdmin() {
  const { userId } = await auth();
  return isPlatformAdminId(userId, process.env.PLATFORM_ADMIN_USER_IDS);
}

/** Requires a signed-in platform admin; anyone else gets a plain 404 (the page's existence is not advertised). */
export async function requirePlatformAdmin() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isPlatformAdminId(userId, process.env.PLATFORM_ADMIN_USER_IDS)) notFound();
  return { userId };
}
