import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, pool } from "../db";
import { abilityHistory, attempts, learnerNotes, messages, questionReviews, questions, sessions, skillMastery, skills, users } from "../db/schema";
import type { Claude } from "../pipeline/generate";
import { metered } from "../pipeline/metered";
import { getClaude, setClaudeForTests } from "./claude";
import { demoStudentId } from "./demo";
import {
  finishTutor, getProgress, getReviewItems, getTeacherView, nextQuestion, reviewWork, submitAnswer, toggleFlag, tutorMessage,
} from "./index";

// Integration tests: need the dev Postgres. Claude is always mocked.
const EMAIL = `server-test-${Date.now()}@test.invalid`;
process.env.DEMO_STUDENT_EMAIL = EMAIL;

const claude = (reply: string): Claude => ({
  messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: reply }], usage: { input_tokens: 10, output_tokens: 5 } }) },
});
const failing = (): Claude => ({ messages: { create: vi.fn().mockRejectedValue(new Error("boom with internals")) } });
const U1 = "11111111-1111-4111-8111-111111111111";

let studentId: string, skillId: string, otherId: string, practiceId: string;
const qids: string[] = [];

// Each test makes the questions it needs (key is always index 1), so none depends on what else is in the dev DB.
async function mkQuestion() {
  const n = qids.length;
  const [r] = await db.insert(questions).values({
    questionKey: crypto.randomUUID(), skillId, stem: `Server test question ${n}?`, choices: ["a", "b", "c", "d"], correct: 1,
    explanation: `Because b ${n}`, difficultyEst: 0, difficultyB: 0, status: "verified" as const,
  }).returning({ id: questions.id });
  qids.push(r.id);
  return r.id;
}
const answerQ = (questionId: string, chosen: number) =>
  submitAnswer({ sessionId: practiceId, questionId, chosen, clientAttemptId: crypto.randomUUID() });
const wrongQ = async () => { const id = await mkQuestion(); await answerQ(id, 0); return id; };
const rightQ = async () => { const id = await mkQuestion(); await answerQ(id, 1); return id; };
const promptOf = (c: Claude) => (c.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0].system as string;

beforeAll(async () => {
  studentId = await demoStudentId();
  [{ id: practiceId }] = await db.insert(sessions).values({ studentId, mode: "practice" }).returning({ id: sessions.id });
  [{ id: skillId }] = await db.select({ id: skills.id }).from(skills).limit(1);
  [{ id: otherId }] = await db.insert(users).values({ role: "student", name: "Other Kid", email: `other-${EMAIL}` }).returning({ id: users.id });
  const rows = await db.insert(questions).values([0, 1, 2].map((n) => ({
    questionKey: crypto.randomUUID(), skillId, stem: `Server test question ${n}?`, choices: ["a", "b", "c", "d"], correct: 1,
    explanation: `Because b ${n}`, difficultyEst: 0, difficultyB: 0, status: "verified" as const,
  }))).returning({ id: questions.id });
  qids.push(...rows.map((r) => r.id));
});

afterEach(() => setClaudeForTests(null));

afterAll(async () => {
  const ids = [studentId, otherId];
  const sess = await db.select({ id: sessions.id }).from(sessions).where(inArray(sessions.studentId, ids));
  const sids = sess.map((s) => s.id);
  if (sids.length) await db.delete(messages).where(inArray(messages.sessionId, sids));
  await db.delete(learnerNotes).where(inArray(learnerNotes.studentId, ids));
  await db.delete(attempts).where(inArray(attempts.studentId, ids));
  await db.delete(abilityHistory).where(inArray(abilityHistory.studentId, ids));
  await db.delete(skillMastery).where(inArray(skillMastery.studentId, ids));
  await db.delete(questionReviews).where(inArray(questionReviews.studentId, ids));
  await db.delete(sessions).where(inArray(sessions.studentId, ids));
  await db.delete(questions).where(inArray(questions.id, qids));
  await db.delete(users).where(inArray(users.id, ids));
  await pool.end();
});

describe("quiz", () => {
  it("nextQuestion hides the answer key and creates a practice session", async () => {
    const r = await nextQuestion();
    expect(r.question).not.toBeNull();
    expect(Object.keys(r.question!)).not.toContain("correct");
    expect(JSON.stringify(r)).not.toMatch(/correctIndex|"correct"/);
    const [s] = await db.select().from(sessions).where(eq(sessions.id, r.sessionId));
    expect(s).toMatchObject({ studentId, mode: "practice" });
    expect((await nextQuestion(r.sessionId)).sessionId).toBe(r.sessionId); // reuses the session
  });

  it("rejects another student's session and bad ids", async () => {
    const [other] = await db.insert(sessions).values({ studentId: otherId, mode: "practice" }).returning({ id: sessions.id });
    await expect(nextQuestion(other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(nextQuestion("not-a-uuid")).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  // nextQuestion may serve any verified question in the dev DB (e.g. the demo seed), so read the real key.
  const keyOf = async (id: string) => (await db.select({ key: questions.correct, why: questions.explanation }).from(questions).where(eq(questions.id, id)))[0];
  const wrongOf = (key: number) => (key + 1) % 4;
  const answerWrong = async () => {
    const { sessionId, question } = await nextQuestion();
    const k = await keyOf(question!.id);
    await submitAnswer({ sessionId, questionId: question!.id, chosen: wrongOf(k.key), clientAttemptId: crypto.randomUUID() });
    return { id: question!.id, ...k };
  };

  it("submitAnswer grades by key with NO model call and does not leak the key", async () => {
    const c = claude("should never be used");
    setClaudeForTests(c);
    const { sessionId, question } = await nextQuestion();
    const k = await keyOf(question!.id);
    const right = await submitAnswer({ sessionId, questionId: question!.id, chosen: k.key, clientAttemptId: crypto.randomUUID() });
    expect(right).toEqual({ correct: true, mastered: false });
    const [a] = await db.select().from(attempts).where(eq(attempts.questionId, question!.id));
    expect(a).toMatchObject({ studentId, correct: true });
    const next = await nextQuestion(sessionId);
    const k2 = await keyOf(next.question!.id);
    const wrong = await submitAnswer({ sessionId, questionId: next.question!.id, chosen: wrongOf(k2.key), clientAttemptId: crypto.randomUUID() });
    expect(wrong).toEqual({ correct: false, mastered: false }); // key stays server-side until reviewWork
    expect(c.messages.create).not.toHaveBeenCalled();
  });

  it("reviewWork needs a wrong attempt, validates input, and works with no model for blank work", async () => {
    await expect(reviewWork({ questionId: "nope", work: "x" })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(reviewWork({ questionId: U1, work: "x" })).rejects.toMatchObject({ code: "BAD_INPUT" }); // never answered
    const q = await answerWrong();
    await expect(reviewWork({ questionId: q.id, work: "x".repeat(1001) })).rejects.toMatchObject({ code: "BAD_INPUT" });

    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY; // blank work must not need a key
    try {
      expect(await reviewWork({ questionId: q.id, work: "  " })).toEqual({ feedback: q.why, correctIndex: q.key });
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("reviewWork returns the model's feedback and saves a hidden note; model failures are a safe MODEL error", async () => {
    const question = await answerWrong();
    setClaudeForTests(claude(JSON.stringify({ feedback: "Step 2 added instead of multiplied.", note: "Adds instead of multiplies." })));
    expect(await reviewWork({ questionId: question.id, work: "I added them" })).toEqual({ feedback: "Step 2 added instead of multiplied.", correctIndex: question.key });
    const notes = await db.select().from(learnerNotes).where(eq(learnerNotes.studentId, studentId));
    expect(notes.find((n) => n.summary === "Adds instead of multiplies.")?.teacherVisible).toBe(false);

    setClaudeForTests(failing());
    const err = await reviewWork({ questionId: question.id, work: "again" }).catch((e) => e);
    expect(err).toMatchObject({ code: "MODEL" });
    expect(err.message).not.toContain("internals");
  });

  it("validates input and ownership", async () => {
    const { sessionId, question } = await nextQuestion();
    const ok = { sessionId, questionId: question!.id, chosen: 0, clientAttemptId: "x" };
    await expect(submitAnswer({ ...ok, sessionId: "nope" })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(submitAnswer({ ...ok, questionId: "nope" })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(submitAnswer({ ...ok, chosen: 9 })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(submitAnswer({ ...ok, chosen: 1.5 })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(submitAnswer({ ...ok, clientAttemptId: "" })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(submitAnswer({ ...ok, clientAttemptId: "x".repeat(101) })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(submitAnswer({ ...ok, questionId: U1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(submitAnswer({ ...ok, sessionId: U1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("review items and flags", () => {
  it("getReviewItems lists wrong and saved-right questions newest first, hides the key, filters by skill", async () => {
    const w = await wrongQ();
    const r = await rightQ();
    const f = await rightQ();
    await toggleFlag({ questionId: f, flagged: true });

    const items = await getReviewItems(skillId);
    const ids = items.map((i) => i.questionId);
    expect(ids).toContain(w);
    expect(ids).toContain(f);
    expect(ids).not.toContain(r); // right and not saved
    expect(ids.indexOf(f)).toBeLessThan(ids.indexOf(w)); // answered later = newer = first
    expect(items.find((i) => i.questionId === w)).toMatchObject({ chosen: 0, wasCorrect: false, flagged: false, done: false, skillId });
    expect(items.find((i) => i.questionId === f)).toMatchObject({ chosen: 1, wasCorrect: true, flagged: true });
    expect(JSON.stringify(items)).not.toMatch(/correctIndex|"correct"|explanation|Because b/); // never the key

    const [{ id: otherSkill }] = await db.select({ id: skills.id }).from(skills).where(sql`${skills.id} <> ${skillId}`).limit(1);
    expect((await getReviewItems(otherSkill)).map((i) => i.questionId)).not.toContain(w);
    await expect(getReviewItems("nope")).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("toggleFlag needs an answered question, is idempotent, and can unflag", async () => {
    const unanswered = await mkQuestion();
    await expect(toggleFlag({ questionId: unanswered, flagged: true })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(toggleFlag({ questionId: "nope", flagged: true })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(toggleFlag({ questionId: unanswered, flagged: "yes" as unknown as boolean })).rejects.toMatchObject({ code: "BAD_INPUT" });

    const q = await rightQ();
    expect(await toggleFlag({ questionId: q, flagged: true })).toEqual({ flagged: true });
    await toggleFlag({ questionId: q, flagged: true });
    expect(await db.select().from(questionReviews).where(eq(questionReviews.questionId, q))).toHaveLength(1);
    expect((await getReviewItems()).map((i) => i.questionId)).toContain(q);

    expect(await toggleFlag({ questionId: q, flagged: false })).toEqual({ flagged: false });
    expect((await getReviewItems()).map((i) => i.questionId)).not.toContain(q); // right + unsaved = gone

    const w = await wrongQ();
    await toggleFlag({ questionId: w, flagged: true });
    await toggleFlag({ questionId: w, flagged: false });
    expect((await getReviewItems()).find((i) => i.questionId === w)).toMatchObject({ flagged: false }); // wrong stays listed
  });
});

describe("tutor", () => {
  it("tutorMessage works on a wrong question: new deepdive session, both messages saved, key only in the model prompt", async () => {
    const q = await wrongQ();
    const c = claude("What was your first step?");
    setClaudeForTests(c);
    const r = await tutorMessage({ questionId: q, message: "  I got it wrong  " });
    expect(r).toEqual({ sessionId: r.sessionId, reply: "What was your first step?" }); // nothing else rides along
    const [s] = await db.select().from(sessions).where(eq(sessions.id, r.sessionId));
    expect(s.mode).toBe("deepdive");
    const rows = await db.select().from(messages).where(eq(messages.sessionId, r.sessionId));
    expect(rows.map((m) => m.role).sort()).toEqual(["assistant", "user"]);
    expect(rows.find((m) => m.role === "user")?.content).toBe("I got it wrong"); // trimmed

    const sys = promptOf(c);
    expect(sys).toContain("The student chose: A) a (wrong)");
    expect(sys).toContain("Official answer (for your guidance only, never state it outright): B) b");
    expect(sys).toMatch(/Official explanation: Because b \d+/);
    expect((await tutorMessage({ sessionId: r.sessionId, questionId: q, message: "again" })).sessionId).toBe(r.sessionId);
  });

  it("only an answered question that was wrong or saved can be discussed", async () => {
    setClaudeForTests(claude("hi"));
    const unanswered = await mkQuestion();
    const right = await rightQ();
    await expect(tutorMessage({ questionId: unanswered, message: "hi" })).rejects.toMatchObject({ code: "BAD_INPUT" }); // would leak its key
    await expect(tutorMessage({ questionId: right, message: "hi" })).rejects.toMatchObject({ code: "BAD_INPUT" }); // not a free chatbot
    await expect(tutorMessage({ questionId: U1, message: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await toggleFlag({ questionId: right, flagged: true }); // saving it makes it reviewable
    const c = claude("Walk me through it.");
    setClaudeForTests(c);
    await tutorMessage({ questionId: right, message: "I'm not sure I understand" });
    expect(promptOf(c)).toContain("(correct, but the student wants to review it)");
  });

  it("validates message length and ids, and rejects another student's session", async () => {
    const q = await wrongQ();
    await expect(tutorMessage({ questionId: q, message: "   " })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(tutorMessage({ questionId: q, message: "x".repeat(1001) })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(tutorMessage({ questionId: "nope", message: "hi" })).rejects.toMatchObject({ code: "BAD_INPUT" });
    const [other] = await db.insert(sessions).values({ studentId: otherId, mode: "deepdive" }).returning({ id: sessions.id });
    await expect(tutorMessage({ sessionId: other.id, questionId: q, message: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("finishTutor saves a hidden note and marks the question done; an empty session is rejected", async () => {
    const q = await wrongQ();
    setClaudeForTests(claude("What did you try first?"));
    const { sessionId } = await tutorMessage({ questionId: q, message: "stuck" });
    setClaudeForTests(claude(JSON.stringify({ summary: "Skips sign flips.", strengths: "Persistent.", effective_methods: { worked_example: 2 }, misconceptions: [] })));
    const note = await finishTutor({ sessionId, questionId: q });
    expect(note).toEqual({ summary: "Skips sign flips.", strengths: "Persistent.", effectiveMethods: { worked_example: 1 } });
    const [row] = await db.select().from(learnerNotes).where(eq(learnerNotes.sessionId, sessionId));
    expect(row).toMatchObject({ teacherVisible: false, skillId });
    expect((await getReviewItems(skillId)).find((i) => i.questionId === q)).toMatchObject({ done: true });

    const f = await rightQ(); // flagged stays flagged after finishing
    await toggleFlag({ questionId: f, flagged: true });
    setClaudeForTests(claude("Tell me more."));
    const { sessionId: s2 } = await tutorMessage({ questionId: f, message: "unsure" });
    setClaudeForTests(claude(JSON.stringify({ summary: "Guessed.", strengths: "", effective_methods: {}, misconceptions: [] })));
    await finishTutor({ sessionId: s2, questionId: f });
    expect((await getReviewItems()).find((i) => i.questionId === f)).toMatchObject({ flagged: true, done: true });

    const [empty] = await db.insert(sessions).values({ studentId, mode: "deepdive", questionId: q }).returning({ id: sessions.id });
    await expect(finishTutor({ sessionId: empty.id, questionId: q })).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("a tutor session is bound to one question: it can't be reused for, or finished against, another", async () => {
    const a = await wrongQ(), b = await wrongQ();
    const c = claude("What did you try?");
    setClaudeForTests(c);
    const { sessionId } = await tutorMessage({ questionId: a, message: "stuck" });
    const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(s.questionId).toBe(a);

    await expect(tutorMessage({ sessionId, questionId: b, message: "now this one" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(finishTutor({ sessionId, questionId: b })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(c.messages.create).toHaveBeenCalledTimes(1); // the mismatched calls never reached the model
    expect((await getReviewItems()).find((i) => i.questionId === b)).toMatchObject({ done: false }); // b was not marked done
    expect((await tutorMessage({ sessionId, questionId: a, message: "back on a" })).sessionId).toBe(sessionId); // the right pairing still works

    const [legacy] = await db.insert(sessions).values({ studentId, mode: "deepdive" }).returning({ id: sessions.id }); // no question
    await expect(tutorMessage({ sessionId: legacy.id, questionId: a, message: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("model failures become a safe MODEL error", async () => {
    const q = await wrongQ();
    setClaudeForTests(failing());
    const err = await tutorMessage({ questionId: q, message: "hi" }).catch((e) => e);
    expect(err).toMatchObject({ code: "MODEL" });
    expect(err.message).not.toContain("internals");
  });
});

describe("config errors", () => {
  it("missing API key gives NO_KEY", async () => {
    const q = await wrongQ();
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => getClaude()).toThrowError(expect.objectContaining({ code: "NO_KEY" }));
      await expect(tutorMessage({ questionId: q, message: "hi" })).rejects.toMatchObject({ code: "NO_KEY" });
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("an exhausted spend cap gives SPEND_CAP", async () => {
    const q = await wrongQ();
    setClaudeForTests(metered(claude("hi"), 0));
    await expect(tutorMessage({ questionId: q, message: "hi" })).rejects.toMatchObject({ code: "SPEND_CAP" });
  });
});

describe("views", () => {
  it("getProgress includes unseen skills and reflects practice", async () => {
    const p = await getProgress();
    const active = await db.select({ id: skills.id }).from(skills).where(eq(skills.active, true));
    expect(p.skills).toHaveLength(active.length);
    expect(p.skills.some((s) => s.state === "unseen" && s.pct === 0)).toBe(true);
    const practiced = p.skills.find((s) => s.skillId === skillId)!;
    expect(practiced.attemptCount).toBeGreaterThan(0);
    expect(practiced.pct).toBeGreaterThanOrEqual(5);
    expect(p.attempts).toBeGreaterThan(0);
    expect(p.history.length).toBeGreaterThan(0);
  });

  it("getTeacherView lists the student and only teacher-visible notes", async () => {
    await db.insert(learnerNotes).values([
      { studentId, skillId, summary: "VISIBLE-NOTE", teacherVisible: true },
      { studentId, skillId, summary: "HIDDEN-NOTE", teacherVisible: false },
    ]);
    const v = await getTeacherView();
    const me = v.students.find((s) => s.id === studentId)!;
    expect(me.attempts).toBeGreaterThan(0);
    expect(Object.keys(me.mastery)).toHaveLength(v.skills.length);
    const summaries = v.notes.map((n) => n.summary);
    expect(summaries).toContain("VISIBLE-NOTE");
    expect(summaries).not.toContain("HIDDEN-NOTE");
  });
});
