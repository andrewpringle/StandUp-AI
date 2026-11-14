import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

let cached: { email: string; id: string } | undefined;

// No auth yet: every request acts as one demo student. shortcut: replace with the signed-in user once auth exists.
export async function demoStudentId(): Promise<string> {
  const email = process.env.DEMO_STUDENT_EMAIL || "demo-student@standup.invalid";
  if (cached?.email === email) return cached.id;
  await db.insert(users).values({ role: "student", name: "Demo Student", email }).onConflictDoNothing(); // safe under races
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  cached = { email, id: u.id };
  return u.id;
}
