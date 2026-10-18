import { readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@clerk/nextjs/server";
import { isPlatformAdminId } from "@/lib/platform-admin";

// The admin guides are not in /public (anything there is readable by anyone with the link). They
// live in /content/guides and are only handed out here, to club admins (and platform admins).
const GUIDES: Record<string, { file: string; download: string }> = {
  "admin-quick-start": { file: "admin-quick-start.pdf", download: "Lineup Manager - Admin Quick Start.pdf" },
  "admin-guide": { file: "admin-guide.pdf", download: "Lineup Manager - Admin Guide.pdf" },
};

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const guide = GUIDES[name];

  const session = await auth();
  if (!session.userId) return new Response("Sign in to view this guide.", { status: 401 });

  const allowed =
    (session.orgId && session.has({ role: "org:admin" })) ||
    isPlatformAdminId(session.userId, process.env.PLATFORM_ADMIN_USER_IDS);
  // Same answer for "no such guide" and "not allowed" so the guides' existence isn't advertised.
  if (!guide || !allowed) return new Response("Not found", { status: 404 });

  const bytes = await readFile(path.join(process.cwd(), "content", "guides", guide.file));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${guide.download}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
