import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Add a real D1 database binding to wrangler.jsonc when implementing persistence."
    );
  }

  return drizzle(env.DB, { schema });
}
