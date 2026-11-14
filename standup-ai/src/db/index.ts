import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// The default URL is the public dev credential, so it must never be used in production.
const url =
  process.env.DATABASE_URL ??
  (process.env.NODE_ENV === "production" ? undefined : "postgres://standup:standup@localhost:5432/standup");
if (!url) throw new Error("DATABASE_URL is required in production");

export const pool = new Pool({ connectionString: url });
export const db = drizzle(pool, { schema });
