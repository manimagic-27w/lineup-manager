import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Neon connection string."
  );
}

// We use the `neon-serverless` (WebSocket/pooled) driver rather than `neon-http` because the
// lineup builder needs real, atomic multi-statement transactions (e.g. "move this player out
// of whatever slot they're currently in, then into this one" without ever briefly double-
// booking them) - `neon-http` is stateless-per-request and doesn't support `db.transaction()`.
//
// Node.js runtimes (Vercel functions, `next start`) don't have a global `WebSocket`
// implementation on every version, so we point neon at the `ws` package explicitly.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
