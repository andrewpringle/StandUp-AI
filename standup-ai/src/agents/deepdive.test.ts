import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, pool } from "../db";
import { learnerNotes, messages, sessions, skills, users } from "../db/schema";
import { CHAT_MAX_TOKENS, EFFORT, MODEL, type Claude } from "../pipeline/generate";
import { deepDiveTurn, finishDeepDive, SYSTEM } from "./deepdive";

// Integration test: needs the dev Postgres (npm run db:up && npm run db:push). Claude is mocked.
const reply = (t: string) => ({ content: [{ type: "text", text: t }], usage: { input_tokens: 11, output_tokens: 7 } });
const mock = (...texts: string[]): Claude => {
  const create = vi.fn();
  texts.forEach((t) => create.mockResolvedValueOnce(reply(t)));
  return { messages: { create } };
};
const sent = (c: Claude) => (c.messages.create as ReturnType<typeof vi.fn>).mock.calls;

const goodNote = {
  summary: "Multiplies binomials by distributing but drops the middle term.",
  strengths: "Careful with signs.",
  effective_methods: { worked_example: 0.9, visual: 0.3 },
  misconceptions: ["forgets the cross terms"],
};

let studentId: string, skillId: string, otherId: string;
const newSession = async (sid = studentId) =>
  (await db.insert(sessions).values({ studentId: sid, mode: "deepdive" }).returning())[0].id;

beforeAll(async () => {
  const stamp = Date.now();
  [{ id: studentId }, { id: otherId }] = await db.insert(users).values([
    { role: "student", name: "T", email: `dd-${stamp}@test.invalid` },
    { role: "student", name: "T2", email: `dd2-${stamp}@test.invalid` },
  ]).returning({ id: users.id });
  [{ id: skillId }] = await db.insert(skills)
    .values({ slug: `dd-test-${stamp}`, subject: "Math", topic: "Test", name: "Test skill" }).returning({ id: skills.id });
});

afterAll(async () => {
  const ids = [studentId, otherId];
  const sess = db.select({ id: sessions.id }).from(sessions).where(inArray(sessions.studentId, ids));
  await db.delete(learnerNotes).where(inArray(learnerNotes.studentId, ids));
  await db.delete(messages).where(inArray(messages.sessionId, sess));
  await db.delete(sessions).where(inArray(sessions.studentId, ids));
  await db.delete(skills).where(eq(skills.id, skillId));
  await db.delete(users).where(inArray(users.id, ids));
  await pool.end();
});

describe("deepDiveTurn", () => {
  it("persists both messages in order, sends history in order, and uses the Socratic system prompt", async () => {
    const sessionId = await newSession();
    const ids = { sessionId, studentId, skillId };
    const c = mock("What did you do first?", "Why multiply that term?");
    expect(await deepDiveTurn(c, { ...ids, studentMessage: "I got 12", questionContext: "Q: (x+2)(x+3)" })).toBe("What did you do first?");
    await deepDiveTurn(c, { ...ids, studentMessage: "I multiplied x and 2" });

    const call = sent(c)[1][0];
    expect(call.messages.map((m: { content: string }) => m.content)).toEqual([
      "I got 12", "What did you do first?", "I multiplied x and 2",
    ]);
    expect(call).toMatchObject({ model: MODEL, max_tokens: CHAT_MAX_TOKENS, output_config: EFFORT });
    expect(call.system).toBe(SYSTEM);
    expect(sent(c)[0][0].system).toContain("never reveal its answer");
    expect(SYSTEM).toMatch(/Never reveal or hand over the answer/);

    const rows = await db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(messages.createdAt);
    expect(rows.map((r) => [r.role, r.content])).toEqual([
      ["user", "I got 12"], ["assistant", "What did you do first?"],
      ["user", "I multiplied x and 2"], ["assistant", "Why multiply that term?"],
    ]);
    expect(rows[1]).toMatchObject({ model: MODEL, inputTokens: 11, outputTokens: 7 });
  });

  it("caps the history sent to the model at 20 prior messages", async () => {
    const sessionId = await newSession();
    const base = Date.now() - 100_000;
    await db.insert(messages).values(Array.from({ length: 30 }, (_, i) => ({
      sessionId, role: i % 2 ? ("assistant" as const) : ("user" as const),
      content: `m${i}`, createdAt: new Date(base + i * 1000),
    })));
    const c = mock("ok");
    await deepDiveTurn(c, { sessionId, studentId, skillId, studentMessage: "new" });
    const m = sent(c)[0][0].messages as { content: string }[];
    expect(m).toHaveLength(21);
    expect(m[0].content).toBe("m10");
    expect(m[19].content).toBe("m29");
    expect(m[20].content).toBe("new");
  });

  it("refuses a session that belongs to another student", async () => {
    const sessionId = await newSession(otherId);
    const c = mock("x");
    await expect(deepDiveTurn(c, { sessionId, studentId, skillId, studentMessage: "hi" })).rejects.toThrow(/not found/);
    expect(sent(c)).toHaveLength(0);
  });
});

describe("finishDeepDive", () => {
  const seed = async () => {
    const sessionId = await newSession();
    await deepDiveTurn(mock("Walk me through it."), { sessionId, studentId, skillId, studentMessage: "I don't get it" });
    return { sessionId, studentId, skillId };
  };

  it("stores a valid note with teacherVisible false and misconceptions in the summary", async () => {
    const ids = await seed();
    const note = await finishDeepDive(mock(JSON.stringify(goodNote)), ids);
    expect(note).toMatchObject({
      teacherVisible: false, studentId, skillId, sessionId: ids.sessionId,
      strengths: "Careful with signs.", effectiveMethods: { worked_example: 0.9, visual: 0.3 },
    });
    expect(note.summary).toContain("Misconceptions noticed: forgets the cross terms.");
  });

  it("clamps scores to 0..1 and trims a long summary", async () => {
    const ids = await seed();
    const long = { ...goodNote, summary: "s".repeat(900), effective_methods: { a: 1.7, b: -2, c: "high" } };
    const note = await finishDeepDive(mock(JSON.stringify(long)), ids);
    expect(note.effectiveMethods).toEqual({ a: 1, b: 0 }); // non-numeric score dropped
    expect(note.summary.startsWith("s".repeat(600))).toBe(true);
    expect(note.summary).not.toContain("s".repeat(601));
  });

  it("retries once on malformed JSON, then throws", async () => {
    const ids = await seed();
    const bad = mock("not json", JSON.stringify({ summary: "", effective_methods: {}, misconceptions: [] }));
    await expect(finishDeepDive(bad, ids)).rejects.toThrow(/invalid learner note twice/);
    expect(sent(bad)).toHaveLength(2);

    const recovers = mock("nope", JSON.stringify(goodNote));
    expect((await finishDeepDive(recovers, ids)).summary).toContain("distributing");
    expect(sent(recovers)).toHaveLength(2);
  });

  it("throws when there is nothing to summarize", async () => {
    const sessionId = await newSession();
    await expect(finishDeepDive(mock("x"), { sessionId, studentId, skillId })).rejects.toThrow(/no messages/);
  });
});
