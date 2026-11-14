// Shared contract between the server layer (src/server) and the UI (src/app, src/components).
// Both sides build against these types. Change them only deliberately.
// No auth yet: every call acts as the single demo student (env DEMO_STUDENT_EMAIL).

export type MasteryState = "unseen" | "learning" | "mastered" | "needs_review";

export type ErrorCode = "SPEND_CAP" | "NO_KEY" | "BAD_INPUT" | "NOT_FOUND" | "MODEL";

// Thrown by the server layer; the UI-facing server actions convert it to {ok:false}.
export class AppError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

export interface QuizQuestion {
  id: string;
  skillId: string;
  skillName: string;
  topic: string;
  stem: string;
  choices: string[]; // never includes the answer key
  difficultyB: number; // roughly -2 (easy) .. 2 (hard)
}

// question === null means nothing servable (no verified questions left).
export interface NextQuestionResult { sessionId: string; question: QuizQuestion | null }

// Right or wrong only, no model call. The key stays server-side until the student has explained their work
// (or asked to see the answer) via reviewWork, so they can't just read it and write a matching explanation.
export interface AnswerResult {
  correct: boolean;
  mastered: boolean; // this answer completed mastery of the skill
}

// Blank work = "show me the answer": no model call, feedback is the stored explanation.
export interface ReviewResult { feedback: string; correctIndex: number }

// A question the student can walk through with the tutor: one they got wrong, or one they saved (flagged),
// typically because they got it right but aren't confident. The correct answer is deliberately NOT included.
export interface ReviewItem {
  questionId: string;
  skillId: string;
  skillName: string;
  topic: string;
  stem: string;
  choices: string[];
  chosen: number; // the student's own choice
  wasCorrect: boolean;
  flagged: boolean;
  done: boolean; // the student finished a tutor walkthrough of this question
  answeredAt: string; // ISO
}

export interface TutorReply { sessionId: string; reply: string }
export interface TutorNote { summary: string; strengths: string; effectiveMethods: Record<string, number> }

export interface SkillProgress {
  skillId: string;
  name: string;
  topic: string;
  subject: string;
  state: MasteryState;
  theta: number;
  sigma: number;
  attemptCount: number;
  pct: number; // 0-100 display progress; 100 when mastered, 0 when unseen
}
export interface AbilityPoint { skillId: string; skillName: string; theta: number; recordedAt: string } // ISO
export interface Progress { skills: SkillProgress[]; history: AbilityPoint[]; attempts: number; correct: number }

export interface TeacherView {
  skills: { id: string; name: string; topic: string }[];
  students: { id: string; name: string; attempts: number; mastery: Record<string, MasteryState> }[]; // key = skill id
  notes: { student: string; skill: string; summary: string; createdAt: string }[]; // only teacher_visible notes
}
