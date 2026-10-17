/**
 * Platform (parent) admins sit above every club. They are named in the PLATFORM_ADMIN_USER_IDS
 * environment variable - a comma- or space-separated list of Clerk user ids (user_...). Kept as
 * plain env config, not a Clerk role, so that no club admin can ever grant or inherit it.
 */
export function parsePlatformAdminIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isPlatformAdminId(userId: string | null | undefined, raw: string | undefined): boolean {
  if (!userId) return false;
  return parsePlatformAdminIds(raw).includes(userId);
}
