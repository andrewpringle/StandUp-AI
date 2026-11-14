import { lt, sql } from "drizzle-orm";
import { db, pool } from "./index";
import { messages } from "./schema";

export const RETENTION_DAYS = 45;

// Hard-deletes raw chat older than the retention window. Returns how many rows went.
export async function deleteOldMessages(days = RETENTION_DAYS): Promise<number> {
  const rows = await db
    .delete(messages)
    .where(lt(messages.createdAt, sql`now() - make_interval(days => ${days})`))
    .returning({ id: messages.id });
  return rows.length;
}

if (process.argv[1]?.endsWith("retention.ts")) {
  deleteOldMessages()
    .then((deleted) => console.log({ deleted }))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => pool.end());
}
