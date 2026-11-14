import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { db, pool } from "./index";
import { deleteOldMessages } from "./retention";
import { messages, sessions, users } from "./schema";

// Integration test: needs the dev Postgres (npm run db:up && npm run db:push).
afterAll(() => pool.end());

it("deletes messages older than 45 days and keeps newer ones", async () => {
  const email = `retention-${Date.now()}@test.invalid`;
  const [u] = await db.insert(users).values({ role: "student", name: "Test", email }).returning();
  const [s] = await db.insert(sessions).values({ studentId: u.id, mode: "practice" }).returning();
  try {
    const at = (days: number) => sql`now() - make_interval(days => ${days})`;
    const [old, fresh] = await db
      .insert(messages)
      .values([
        { sessionId: s.id, role: "user", content: "old", createdAt: at(46) as unknown as Date },
        { sessionId: s.id, role: "user", content: "fresh", createdAt: at(44) as unknown as Date },
      ])
      .returning({ id: messages.id });
    expect(await deleteOldMessages()).toBeGreaterThanOrEqual(1);
    const left = await db.select({ id: messages.id }).from(messages).where(eq(messages.sessionId, s.id));
    expect(left.map((r) => r.id)).toEqual([fresh.id]);
    expect(left.map((r) => r.id)).not.toContain(old.id);
  } finally {
    await db.delete(messages).where(eq(messages.sessionId, s.id));
    await db.delete(sessions).where(inArray(sessions.id, [s.id]));
    await db.delete(users).where(eq(users.id, u.id));
  }
});
