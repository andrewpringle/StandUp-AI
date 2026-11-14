import {
  index, integer, jsonb, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid, boolean,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at").notNull().defaultNow();

export const roleEnum = pgEnum("role", ["student", "teacher"]);
export const testEnum = pgEnum("test", ["SAT", "ACT", "both"]);
export const questionStatusEnum = pgEnum("question_status", ["draft", "verified", "live", "retired"]);
export const sessionModeEnum = pgEnum("session_mode", ["diagnostic", "practice", "deepdive", "practice_test"]);
export const servedReasonEnum = pgEnum("served_reason", ["diagnostic", "weak", "review", "new"]);
export const masteryStateEnum = pgEnum("mastery_state", ["unseen", "learning", "mastered", "needs_review"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);

export const users = pgTable("users", {
  id: id(),
  role: roleEnum("role").notNull(),
  name: text("name").notNull(), // PII; kept here so learning tables only hold the opaque id
  email: text("email").notNull().unique(),
  createdAt: createdAt(),
});

export const classes = pgTable("classes", {
  id: id(),
  teacherId: uuid("teacher_id").notNull().references(() => users.id),
  name: text("name").notNull(),
});

export const classEnrollments = pgTable("class_enrollments", {
  classId: uuid("class_id").notNull().references(() => classes.id),
  studentId: uuid("student_id").notNull().references(() => users.id),
}, (t) => [primaryKey({ columns: [t.classId, t.studentId] })]);

export const skills = pgTable("skills", {
  id: id(),
  slug: text("slug").notNull().unique(),
  subject: text("subject").notNull(),
  topic: text("topic").notNull(),
  name: text("name").notNull(),
  test: testEnum("test").notNull().default("both"),
  active: boolean("active").notNull().default(true),
});

export const skillPrereqs = pgTable("skill_prereqs", {
  skillId: uuid("skill_id").notNull().references(() => skills.id),
  prereqId: uuid("prereq_id").notNull().references(() => skills.id),
}, (t) => [primaryKey({ columns: [t.skillId, t.prereqId] })]);

export const misconceptions = pgTable("misconceptions", {
  id: id(),
  skillId: uuid("skill_id").notNull().references(() => skills.id),
  name: text("name").notNull(),
  description: text("description"),
});

// Immutable: fixing a question inserts a new version and retires the old one.
export const questions = pgTable("questions", {
  id: id(),
  questionKey: uuid("question_key").notNull(),
  version: integer("version").notNull().default(1),
  skillId: uuid("skill_id").notNull().references(() => skills.id),
  stem: text("stem").notNull(),
  choices: jsonb("choices").$type<string[]>().notNull(),
  correct: integer("correct").notNull(), // index into choices
  explanation: text("explanation"),
  difficultyEst: real("difficulty_est").notNull(), // generator's guess
  difficultyB: real("difficulty_b").notNull(), // calibrated; starts = est
  calibrationN: integer("calibration_n").notNull().default(0),
  status: questionStatusEnum("status").notNull().default("draft"),
  verification: jsonb("verification"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("questions_key_version").on(t.questionKey, t.version)]);

export const sessions = pgTable("sessions", {
  id: id(),
  studentId: uuid("student_id").notNull().references(() => users.id),
  mode: sessionModeEnum("mode").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

// Append-only. skill_mastery is derived from this and can be replayed.
export const attempts = pgTable("attempts", {
  id: id(),
  clientAttemptId: text("client_attempt_id").notNull(), // idempotency for retries, unique per student
  studentId: uuid("student_id").notNull().references(() => users.id),
  questionId: uuid("question_id").notNull().references(() => questions.id),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  chosen: integer("chosen").notNull(),
  correct: boolean("correct").notNull(),
  timeMs: integer("time_ms"),
  hintsUsed: integer("hints_used").notNull().default(0),
  thetaBefore: real("theta_before").notNull(),
  sigmaBefore: real("sigma_before").notNull(),
  pExpected: real("p_expected").notNull(),
  servedReason: servedReasonEnum("served_reason").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("attempts_student_client_id").on(t.studentId, t.clientAttemptId),
  index("attempts_student_created").on(t.studentId, t.createdAt),
  index("attempts_session").on(t.sessionId),
]);

export const skillMastery = pgTable("skill_mastery", {
  studentId: uuid("student_id").notNull().references(() => users.id),
  skillId: uuid("skill_id").notNull().references(() => skills.id),
  theta: real("theta").notNull().default(0),
  sigma: real("sigma").notNull().default(1.5),
  state: masteryStateEnum("state").notNull().default("unseen"),
  lastPracticedAt: timestamp("last_practiced_at"),
  sessionCount: integer("session_count").notNull().default(0),
  attemptCount: integer("attempt_count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.studentId, t.skillId] })]);

// Per-student state for tutor review: `flagged` = saved to revisit (even if answered right); `doneAt` = finished a
// tutor walkthrough. Wrong answers are derived from attempts, so a row exists only once flagged or walked through.
export const questionReviews = pgTable("question_reviews", {
  studentId: uuid("student_id").notNull().references(() => users.id),
  questionId: uuid("question_id").notNull().references(() => questions.id),
  flagged: boolean("flagged").notNull().default(false),
  flaggedAt: timestamp("flagged_at"),
  doneAt: timestamp("done_at"),
}, (t) => [primaryKey({ columns: [t.studentId, t.questionId] })]);

export const abilityHistory = pgTable("ability_history", {
  id: id(),
  studentId: uuid("student_id").notNull().references(() => users.id),
  skillId: uuid("skill_id").notNull().references(() => skills.id),
  theta: real("theta").notNull(),
  sigma: real("sigma").notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const learnerNotes = pgTable("learner_notes", {
  id: id(),
  studentId: uuid("student_id").notNull().references(() => users.id),
  skillId: uuid("skill_id").references(() => skills.id),
  sessionId: uuid("session_id").references(() => sessions.id),
  misconceptionIds: uuid("misconception_ids").array().notNull().default([]),
  effectiveMethods: jsonb("effective_methods").$type<Record<string, number>>(),
  strengths: text("strengths"),
  summary: text("summary").notNull(),
  teacherVisible: boolean("teacher_visible").notNull().default(false), // flip only after redaction/review
  createdAt: createdAt(),
});

// Raw chat; `npm run db:retention` (src/db/retention.ts) hard-deletes rows older than 45 days. Run it daily.
export const messages = pgTable("messages", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: createdAt(),
}, (t) => [index("messages_session").on(t.sessionId), index("messages_created").on(t.createdAt)]);
