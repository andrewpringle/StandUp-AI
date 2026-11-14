import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { abilityHistory, attempts, learnerNotes, messages, questionReviews, questions, sessions, skillMastery, skills, users } from "../db/schema";
import * as quiz from "../agents/quiz";
import { deepDiveTurn, finishDeepDive } from "../agents/deepdive";
import { predict } from "../engine";
import { modelCall } from "./claude";
import {
  AppError, type AnswerResult, type MasteryState, type NextQuestionResult, type Progress, type ReviewItem,
  type ReviewResult, type TeacherView, type TutorNote, type TutorReply,
} from "./contracts";
import { demoStudentId } from "./demo";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (msg: string) => new AppError("BAD_INPUT", msg);
const uuid = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !UUID.test(v)) throw bad(`Invalid ${what}.`);
  return v;
};

// A student may only use their own sessions; anything else looks like "not found".
// A tutor session is bound to one question: passing `questionId` also requires the session to be about that question.
async function ownSession(id: string, studentId: string, mode?: "practice" | "deepdive", questionId?: string) {
  const [s] = await db.select({ id: sessions.id }).from(sessions).where(and(
    eq(sessions.id, id), eq(sessions.studentId, studentId),
    mode ? eq(sessions.mode, mode) : undefined,
    questionId ? eq(sessions.questionId, questionId) : undefined,
  ));
  if (!s) throw new AppError("NOT_FOUND", "Session not found.");
}

async function newSession(studentId: string, mode: "practice" | "deepdive", questionId?: string) {
  const [s] = await db.insert(sessions).values({ studentId, mode, questionId }).returning({ id: sessions.id });
  return s.id;
}

export async function nextQuestion(sessionId?: string): Promise<NextQuestionResult> {
  const studentId = await demoStudentId();
  let sid: string;
  if (sessionId === undefined) sid = await newSession(studentId, "practice");
  else { sid = uuid(sessionId, "session"); await ownSession(sid, studentId, "practice"); }

  const next = await quiz.nextQuestion(studentId);
  if (!next) return { sessionId: sid, question: null };
  const q = next.question;
  const [sk] = await db.select({ name: skills.name, topic: skills.topic }).from(skills).where(eq(skills.id, q.skillId));
  // Explicit field list: the answer key must never ride along.
  return { sessionId: sid, question: { id: q.id, skillId: q.skillId, skillName: sk.name, topic: sk.topic, stem: q.stem, choices: q.choices, difficultyB: q.difficultyB } };
}

export async function submitAnswer(i: {
  sessionId: string; questionId: string; chosen: number; clientAttemptId: string; timeMs?: number;
}): Promise<AnswerResult> {
  const sessionId = uuid(i.sessionId, "session");
  const questionId = uuid(i.questionId, "question");
  if (typeof i.clientAttemptId !== "string" || !i.clientAttemptId || i.clientAttemptId.length > 100) throw bad("Invalid attempt id.");
  if (i.timeMs !== undefined && (!Number.isInteger(i.timeMs) || i.timeMs < 0)) throw bad("Invalid time.");
  const studentId = await demoStudentId();
  await ownSession(sessionId, studentId, "practice");

  const [q] = await db.select({ skillId: questions.skillId, choices: questions.choices }).from(questions).where(eq(questions.id, questionId));
  if (!q) throw new AppError("NOT_FOUND", "Question not found.");
  if (!Number.isInteger(i.chosen) || i.chosen < 0 || i.chosen >= q.choices.length) throw bad("Invalid choice.");

  const [m] = await db.select({ n: skillMastery.attemptCount }).from(skillMastery)
    .where(and(eq(skillMastery.studentId, studentId), eq(skillMastery.skillId, q.skillId)));
  const res = await quiz.submitAnswer({
    studentId, sessionId, questionId, chosen: i.chosen, clientAttemptId: i.clientAttemptId, timeMs: i.timeMs,
    servedReason: (m?.n ?? 0) === 0 ? "new" : "weak",
  });
  // Right/wrong only: no model call here, and the key stays server-side until reviewWork.
  return { correct: res.correct, mastered: res.mastered };
}

// After a wrong answer: the student explains their work and Haiku says where it went wrong. Blank work = show me
// the answer (no model call). Only a question this student actually got wrong can be reviewed, so this can't be
// used as a free-form chatbot.
export async function reviewWork(i: { questionId: string; work: string }): Promise<ReviewResult> {
  const questionId = uuid(i.questionId, "question");
  const work = typeof i.work === "string" ? i.work.trim() : "";
  if (work.length > 1000) throw bad("Explanation must be 1000 characters or fewer.");
  const studentId = await demoStudentId();
  if (!(await quiz.wrongAttempt(studentId, questionId))) throw bad("There's nothing to review for this question.");
  return work
    ? modelCall((c) => quiz.reviewWork(c, { studentId, questionId, work }))
    : quiz.reviewWork(null, { studentId, questionId, work });
}

const letter = (n: number) => String.fromCharCode(65 + n);
const upsertReview = (studentId: string, questionId: string, set: Partial<typeof questionReviews.$inferInsert>) =>
  db.insert(questionReviews).values({ studentId, questionId, ...set })
    .onConflictDoUpdate({ target: [questionReviews.studentId, questionReviews.questionId], set });

// The student's attempts on a question, newest first. Empty = they haven't answered it.
const attemptsOn = (studentId: string, questionId: string) =>
  db.select().from(attempts).where(and(eq(attempts.studentId, studentId), eq(attempts.questionId, questionId)))
    .orderBy(desc(attempts.createdAt));

// A question the tutor may discuss: answered by this student AND (got it wrong OR saved it). Closes two holes:
// the tutor can't be a free chatbot, and it can't be asked about a question the student hasn't answered yet,
// because the model is told that question's key.
async function reviewTarget(studentId: string, questionId: string) {
  const [q] = await db.select().from(questions).where(eq(questions.id, questionId));
  if (!q) throw new AppError("NOT_FOUND", "Question not found.");
  const tries = await attemptsOn(studentId, questionId);
  if (!tries.length) throw bad("Answer this question first.");
  const [rv] = await db.select().from(questionReviews)
    .where(and(eq(questionReviews.studentId, studentId), eq(questionReviews.questionId, questionId)));
  if (!tries.some((a) => !a.correct) && !rv?.flagged) throw bad("Save this question or get it wrong to review it with the tutor.");
  return { q, last: tries[0] };
}

// Wrong answers (derived from attempts) plus questions the student saved, newest first. Never includes the key.
// shortcut: groups one student's attempts in memory; fine at hundreds of rows, move to SQL (distinct on) if it grows.
export async function getReviewItems(skillId?: string): Promise<ReviewItem[]> {
  const filter = skillId === undefined ? undefined : eq(questions.skillId, uuid(skillId, "skill"));
  const studentId = await demoStudentId();
  const rows = await db.select({
    questionId: attempts.questionId, chosen: attempts.chosen, correct: attempts.correct, at: attempts.createdAt,
    skillId: skills.id, skillName: skills.name, topic: skills.topic, stem: questions.stem, choices: questions.choices,
  }).from(attempts)
    .innerJoin(questions, eq(attempts.questionId, questions.id))
    .innerJoin(skills, eq(questions.skillId, skills.id))
    .where(and(eq(attempts.studentId, studentId), filter))
    .orderBy(desc(attempts.createdAt));
  const reviews = new Map((await db.select().from(questionReviews).where(eq(questionReviews.studentId, studentId))).map((r) => [r.questionId, r]));

  const latest = new Map<string, (typeof rows)[number]>(); // first hit per question = newest attempt
  const everWrong = new Set<string>();
  for (const r of rows) {
    if (!latest.has(r.questionId)) latest.set(r.questionId, r);
    if (!r.correct) everWrong.add(r.questionId);
  }
  return [...latest.values()]
    .filter((r) => everWrong.has(r.questionId) || reviews.get(r.questionId)?.flagged)
    .map((r) => ({
      questionId: r.questionId, skillId: r.skillId, skillName: r.skillName, topic: r.topic, stem: r.stem, choices: r.choices,
      chosen: r.chosen, wasCorrect: r.correct, flagged: !!reviews.get(r.questionId)?.flagged,
      done: !!reviews.get(r.questionId)?.doneAt, answeredAt: r.at.toISOString(),
    }));
}

// Save (or unsave) a question to come back to, typically one answered right without full confidence.
export async function toggleFlag(i: { questionId: string; flagged: boolean }): Promise<{ flagged: boolean }> {
  const questionId = uuid(i.questionId, "question");
  if (typeof i.flagged !== "boolean") throw bad("Invalid flag.");
  const studentId = await demoStudentId();
  if (!(await attemptsOn(studentId, questionId)).length) throw bad("Answer this question first.");
  await upsertReview(studentId, questionId, { flagged: i.flagged, flaggedAt: i.flagged ? new Date() : null });
  return { flagged: i.flagged };
}

export async function tutorMessage(i: { sessionId?: string; questionId: string; message: string }): Promise<TutorReply> {
  const questionId = uuid(i.questionId, "question");
  const message = typeof i.message === "string" ? i.message.trim() : "";
  if (!message || message.length > 1000) throw bad("Message must be 1 to 1000 characters.");

  const studentId = await demoStudentId();
  const { q, last } = await reviewTarget(studentId, questionId);
  let sid: string;
  if (i.sessionId === undefined) sid = await newSession(studentId, "deepdive", questionId);
  else { sid = uuid(i.sessionId, "session"); await ownSession(sid, studentId, "deepdive", questionId); }

  // Built here, never taken from the client. The model gets the key to steer with; deepDiveTurn tells it not to state it.
  const questionContext = [
    `Question: ${q.stem}`,
    q.choices.map((c, n) => `${letter(n)}) ${c}`).join("\n"),
    `The student chose: ${letter(last.chosen)}) ${q.choices[last.chosen]} (${last.correct ? "correct, but the student wants to review it" : "wrong"})`,
    `Official answer (for your guidance only, never state it outright): ${letter(q.correct)}) ${q.choices[q.correct]}. Official explanation: ${q.explanation ?? "(none)"}`,
  ].join("\n");
  const reply = await modelCall((c) => deepDiveTurn(c, { sessionId: sid, studentId, skillId: q.skillId, studentMessage: message, questionContext }));
  return { sessionId: sid, reply };
}

export async function finishTutor(i: { sessionId: string; questionId: string }): Promise<TutorNote> {
  const sessionId = uuid(i.sessionId, "session");
  const questionId = uuid(i.questionId, "question");
  const studentId = await demoStudentId();
  await ownSession(sessionId, studentId, "deepdive", questionId);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(eq(messages.sessionId, sessionId));
  if (!n) throw bad("Nothing to summarize yet. Chat with the tutor first.");
  const { q } = await reviewTarget(studentId, questionId);

  const note = await modelCall((c) => finishDeepDive(c, { sessionId, studentId, skillId: q.skillId }));
  await upsertReview(studentId, questionId, { doneAt: new Date() });
  return { summary: note.summary, strengths: note.strengths ?? "", effectiveMethods: note.effectiveMethods ?? {} };
}

export async function getProgress(): Promise<Progress> {
  const studentId = await demoStudentId();
  const rows = await db.select({
    skillId: skills.id, name: skills.name, topic: skills.topic, subject: skills.subject,
    state: skillMastery.state, theta: skillMastery.theta, sigma: skillMastery.sigma, attemptCount: skillMastery.attemptCount,
  }).from(skills)
    .leftJoin(skillMastery, and(eq(skillMastery.skillId, skills.id), eq(skillMastery.studentId, studentId)))
    .where(eq(skills.active, true)).orderBy(skills.subject, skills.topic, skills.name);

  const history = await db.select({ skillId: abilityHistory.skillId, skillName: skills.name, theta: abilityHistory.theta, recordedAt: abilityHistory.recordedAt })
    .from(abilityHistory).innerJoin(skills, eq(abilityHistory.skillId, skills.id))
    .where(eq(abilityHistory.studentId, studentId)).orderBy(desc(abilityHistory.recordedAt)).limit(200);

  const [t] = await db.select({ attempts: sql<number>`count(*)::int`, correct: sql<number>`count(*) filter (where ${attempts.correct})::int` })
    .from(attempts).where(eq(attempts.studentId, studentId));

  return {
    skills: rows.map((r) => {
      const state: MasteryState = r.state ?? "unseen";
      const theta = r.theta ?? 0;
      const pct = state === "mastered" ? 100 : state === "unseen" ? 0 : Math.min(95, Math.max(5, Math.round(100 * predict(theta, 0))));
      return { skillId: r.skillId, name: r.name, topic: r.topic, subject: r.subject, state, theta, sigma: r.sigma ?? 0, attemptCount: r.attemptCount ?? 0, pct };
    }),
    history: history.reverse().map((h) => ({ ...h, recordedAt: h.recordedAt.toISOString() })),
    attempts: t.attempts,
    correct: t.correct,
  };
}

export async function getTeacherView(): Promise<TeacherView> {
  const skillRows = await db.select({ id: skills.id, name: skills.name, topic: skills.topic }).from(skills)
    .where(eq(skills.active, true)).orderBy(skills.topic, skills.name);
  const people = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "student")).orderBy(users.name);
  const mastery = await db.select({ studentId: skillMastery.studentId, skillId: skillMastery.skillId, state: skillMastery.state }).from(skillMastery);
  const counts = await db.select({ studentId: attempts.studentId, n: sql<number>`count(*)::int` }).from(attempts).groupBy(attempts.studentId);
  const notes = await db.select({ student: users.name, skill: skills.name, summary: learnerNotes.summary, createdAt: learnerNotes.createdAt })
    .from(learnerNotes).innerJoin(users, eq(learnerNotes.studentId, users.id)).leftJoin(skills, eq(learnerNotes.skillId, skills.id))
    .where(eq(learnerNotes.teacherVisible, true)).orderBy(desc(learnerNotes.createdAt)).limit(20);

  return {
    skills: skillRows,
    students: people.map((p) => ({
      id: p.id, name: p.name,
      attempts: counts.find((c) => c.studentId === p.id)?.n ?? 0,
      mastery: Object.fromEntries(
        skillRows.map((s) => [s.id, mastery.find((m) => m.studentId === p.id && m.skillId === s.id)?.state ?? "unseen"]),
      ),
    })),
    notes: notes.map((n) => ({ student: n.student, skill: n.skill ?? "General", summary: n.summary, createdAt: n.createdAt.toISOString() })),
  };
}
