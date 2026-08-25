import { drizzle } from "drizzle-orm/d1";
import { getFactoryEnv } from "../app/runtime-env";
import * as schema from "./schema";

export function getDb() {
  const d1 = getFactoryEnv().DB;
  if (!d1) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(d1, { schema });
}

export function getD1(): D1Database {
  const d1 = getFactoryEnv().DB;
  if (!d1) {
    throw new Error("FACTORY_D1_UNAVAILABLE");
  }
  return d1;
}
