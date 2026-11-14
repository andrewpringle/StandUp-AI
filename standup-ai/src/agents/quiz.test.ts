import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, pool } from "../db";
import { abilityHistory, attempts, learnerNotes, questions, sessions, skillMastery, skills, users } from "../db/schema";
import type { Claude } from "../pipeline/generate";
import { nextQuestion, reviewWork, submitAnswer } from "./quiz";

// Integration test: needs the dev Postgres (npm run db:up && npm run db:push). Claude is mocked.
const tag = `quiztest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const KEY = 2; // every test question's correct index
let skillId: string;
let verified: string[] = [];
let draftId: string;
const students: { studentId: string; sessionId: string }[] = [];

async function student() {
  const [u] = await db.insert(users).values({ role: "student", name: "T", email: `${tag}-${students.length}@test.invalid` }).returning();
  const [s] = await db.insert(sessions).values({ studentId: u.id, mode: "practice" }).returning();
  students.push({ studentId: u.id, sessionId: s.id });
  return students.at(-1)!;
}
const answer = (st: { studentId: string; sessionId: string }, questionId: string, chosen: number, id = randomUUID()) =>
  submitAnswer({ ...st, questionId, chosen, clientAttemptId: id, servedReason: "new" });
const mastery = async (studentId: string) =>
  (await db.select().from(skillMastery).where(eq(skillMastery.studentId, studentId)))[0];
const mockClaude = (reply = "Nice work"): Claude => ({
  messages: { create: vi.fn().mockResolvedValue({ content: reply ? [{ type: "text", text: reply }] : [] }) },
});

beforeAll(async () => {
  const [s] = await db.insert(skills).values({ slug: tag, subject: "Math", topic: "Test", name: "Quiz test skill" }).returning();
  skillId = s.id;
  const mk = (b: number, status: "verified" | "draft", i: number) => ({
    questionKey: randomUUID(), skillId, stem: `${tag} stem ${i}`, choices: ["a", "b", "c", "d"], correct: KEY,
    explanation: "because c", difficultyEst: b, difficultyB: b, status,
  });
  const rows = await db.insert(questions).values([mk(-1, "verified", 0), mk(0, "verified", 1), mk(1, "verified", 2), mk(0, "draft", 3)]).returning();
  verified = rows.filter((r) => r.status === "verified").map((r) => r.id);
  draftId = rows.find((r) => r.status === "draft")!.id;
});

afterAll(async () => {
  const ids = students.map((s) => s.studentId);
  if (ids.length) {
    await db.delete(abilityHistory).where(inArray(abilityHistory.studentId, ids));
    await db.delete(attempts).where(inArray(attempts.studentId, ids));
    await db.delete(skillMastery).where(inArray(skillMastery.studentId, ids));
    await db.delete(learnerNotes).where(inArray(learnerNotes.studentId, ids));
    await db.delete(sessions).where(inArray(sessions.studentId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  await db.delete(questions).where(eq(questions.skillId, skillId));
  await db.delete(skills).where(eq(skills.id, skillId));
  await pool.end();
});

describe("quiz agent", () => {
  it("grades by the stored key and reveals it after answering", async () => {
    const st = await student();
    expect(await answer(st, verified[0], KEY)).toMatchObject({ correct: true, correctIndex: KEY, explanation: "because c" });
    expect(await answer(st, verified[1], 0)).toMatchObject({ correct: false, correctIndex: KEY });
    await expect(answer(st, verified[2], 9)).rejects.toThrow(/valid choice/);
  });

  it("moves theta up on a correct answer and down on a wrong one", async () => {
    const up = await student(), down = await student();
    await answer(up, verified[1], KEY);
    await answer(down, verified[1], 0);
    expect((await mastery(up.studentId)).theta).toBeGreaterThan(0);
    expect((await mastery(down.studentId)).theta).toBeLessThan(0);
    expect((await mastery(up.studentId)).state).toBe("learning");
  });

  it("replaying a clientAttemptId does not update twice", async () => {
    const st = await student();
    const id = randomUUID();
    const first = await answer(st, verified[1], KEY, id);
    const before = await mastery(st.studentId);
    expect(await answer(st, verified[1], KEY, id)).toEqual(first);
    const after = await mastery(st.studentId);
    expect(after).toMatchObject({ attemptCount: 1, theta: before.theta, sigma: before.sigma });
    expect(await db.select().from(attempts).where(eq(attempts.studentId, st.studentId))).toHaveLength(1);
    expect(await db.select().from(abilityHistory).where(eq(abilityHistory.studentId, st.studentId))).toHaveLength(1);
  });

  it("serves each verified question once, never the key, never a draft", async () => {
    const st = await student();
    const served: string[] = [];
    for (;;) {
      const next = await nextQuestion(st.studentId, { skillId });
      if (!next) break;
      expect(next.question).not.toHaveProperty("correct");
      served.push(next.question.id);
      await answer(st, next.question.id, KEY);
    }
    expect([...served].sort()).toEqual([...verified].sort());
    expect(served).not.toContain(draftId);
  });

  it("without a skillId picks the weakest skill that has questions", async () => {
    const st = await student();
    await db.insert(skillMastery).values({ studentId: st.studentId, skillId, theta: -5 });
    expect((await nextQuestion(st.studentId))?.question.skillId).toBe(skillId);
  });

  const notesOf = async (studentId: string) => db.select().from(learnerNotes).where(eq(learnerNotes.studentId, studentId));
  const sentTo = (c: Claude) => (c.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
  const review = JSON.stringify({ feedback: "You added instead of multiplying in step 2.", note: "Adds the constants instead of multiplying." });

  it("reviewWork sends the student's work and the key, saves the model's note hidden from teachers, returns feedback", async () => {
    const st = await student();
    await answer(st, verified[0], 0); // wrong
    const claude = mockClaude(review);
    const out = await reviewWork(claude, { ...st, questionId: verified[0], work: "  I added 2 and 3  " });
    expect(out).toEqual({ feedback: "You added instead of multiplying in step 2.", correctIndex: KEY });
    const prompt = sentTo(claude).messages[0].content;
    expect(prompt).toContain("I added 2 and 3");
    expect(prompt).toContain("Correct answer: C)");
    expect(prompt).toContain("(wrong)");
    expect(sentTo(claude).system).toContain("untrusted");
    const [note] = await notesOf(st.studentId);
    expect(note).toMatchObject({ summary: "Adds the constants instead of multiplying.", teacherVisible: false, sessionId: st.sessionId });
  });

  it("reviewWork puts an earlier learner note in the prompt", async () => {
    const st = await student();
    await answer(st, verified[0], 1);
    await db.insert(learnerNotes).values({ studentId: st.studentId, skillId, summary: "Responds well to number-line pictures" });
    const claude = mockClaude(review);
    await reviewWork(claude, { ...st, questionId: verified[0], work: "guessed" });
    expect(sentTo(claude).messages[0].content).toContain("number-line pictures");
  });

  it("blank work skips the model and reveals the stored explanation", async () => {
    const st = await student();
    await answer(st, verified[0], 0);
    expect(await reviewWork(null, { ...st, questionId: verified[0], work: "   " })).toEqual({ feedback: "because c", correctIndex: KEY });
    expect(await notesOf(st.studentId)).toHaveLength(0);
  });

  it("a plain-text or empty model reply still gives feedback and saves no note", async () => {
    const st = await student();
    await answer(st, verified[0], 0);
    expect((await reviewWork(mockClaude("Check your signs."), { ...st, questionId: verified[0], work: "x" })).feedback).toBe("Check your signs.");
    expect((await reviewWork(mockClaude(""), { ...st, questionId: verified[0], work: "x" })).feedback).toBe("because c");
    expect(await notesOf(st.studentId)).toHaveLength(0);
  });

  it("only a wrong attempt can be reviewed", async () => {
    const st = await student();
    await expect(reviewWork(null, { ...st, questionId: verified[0], work: "" })).rejects.toThrow(/no wrong attempt/); // never answered
    await answer(st, verified[1], KEY);
    await expect(reviewWork(null, { ...st, questionId: verified[1], work: "" })).rejects.toThrow(/no wrong attempt/); // answered right
  });
});
