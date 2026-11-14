import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { learnerNotes, messages, sessions } from "../db/schema";
import { CHAT_MAX_TOKENS, EFFORT, MODEL, parseJson, text, type Claude } from "../pipeline/generate";

export const SYSTEM = `You are a friendly ACT/SAT tutor for teenagers. Your job is to find out HOW the student thinks, not to hand them answers.
- Ask ONE short question at a time that probes their reasoning and workflow ("walk me through your first step", "why that step?").
- Never reveal or hand over the answer, even if asked. Give at most a small nudge once you understand where they are stuck.
- Notice misconceptions. Try a different explanation style (worked example, picture, plain-words rephrase) and watch which one lands.
- Keep every reply under about 80 words, in plain, warm language.
- Never ask for personal information. If the student shares something personal or upsetting, respond kindly in one or two sentences and steer back to the problem. Do not probe it.`;

const NOTE_SYSTEM = `You write a short learning note about a student from a tutoring transcript.
Educational content only: skills, reasoning habits, misconceptions, and which explanation styles worked. Omit names, personal details, and anything not about the school work.
Reply with strict JSON only, no prose:
{"summary":"<2-4 sentences>","strengths":"<one sentence>","effective_methods":{"<short method name, e.g. worked_example>":<0 to 1>},"misconceptions":["<short plain-words misconception>"]}`;

const HISTORY_CAP = 20; // prior messages sent per turn, to bound cost
const TRANSCRIPT_CAP = 40;

type Chat = { role: "user" | "assistant"; content: string };
type Ids = { sessionId: string; studentId: string; skillId: string };

// A student may only touch their own session; sessionId alone must never expose another transcript.
async function assertOwns(sessionId: string, studentId: string) {
  const [s] = await db.select({ id: sessions.id }).from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.studentId, studentId)));
  if (!s) throw new Error("deep-dive: session not found for this student");
}

// Last `cap` user/assistant messages, oldest first, starting on a user turn (the API needs that).
async function history(sessionId: string, cap: number): Promise<Chat[]> {
  const rows = await db.select({ role: messages.role, content: messages.content }).from(messages)
    .where(eq(messages.sessionId, sessionId)).orderBy(desc(messages.createdAt)).limit(cap);
  const chat = rows.reverse().filter((m): m is Chat => m.role !== "system");
  while (chat[0]?.role === "assistant") chat.shift();
  return chat;
}

// `questionContext` = the question stem and the student's choice. Never pass the answer key.
export async function deepDiveTurn(
  claude: Claude,
  a: Ids & { studentMessage: string; questionContext?: string },
): Promise<string> {
  await assertOwns(a.sessionId, a.studentId);
  const prior = await history(a.sessionId, HISTORY_CAP);
  const r = await claude.messages.create({
    model: MODEL,
    max_tokens: CHAT_MAX_TOKENS,
    output_config: EFFORT,
    system: a.questionContext ? `${SYSTEM}\n\nCurrent question (never reveal its answer): ${a.questionContext}` : SYSTEM,
    messages: [...prior, { role: "user", content: a.studentMessage }],
  });
  const reply = text(r).trim();
  if (!reply) throw new Error("deep-dive: model returned no text");
  // Persist after the call so a failed call leaves no orphan student message to duplicate on retry.
  const at = Date.now();
  await db.insert(messages).values([
    { sessionId: a.sessionId, role: "user", content: a.studentMessage, createdAt: new Date(at) },
    {
      sessionId: a.sessionId, role: "assistant", content: reply, model: MODEL,
      inputTokens: r.usage?.input_tokens, outputTokens: r.usage?.output_tokens, createdAt: new Date(at + 1),
    },
  ]);
  return reply;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export interface Note { summary: string; strengths: string; effectiveMethods: Record<string, number> }

// Validates the model's JSON; null means reject.
export function toNote(v: unknown): Note | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const { summary, strengths, effective_methods: em, misconceptions: mis } = o;
  if (typeof summary !== "string" || !summary.trim()) return null;
  if (!em || typeof em !== "object" || Array.isArray(em) || !Array.isArray(mis)) return null;
  const effectiveMethods = Object.fromEntries(
    Object.entries(em)
      .filter(([, s]) => typeof s === "number" && Number.isFinite(s))
      .map(([k, s]) => [k, clamp01(s as number)]),
  );
  const wrong = mis.filter((m): m is string => typeof m === "string" && m.trim() !== "")
    .slice(0, 5).map((m) => m.trim().slice(0, 100));
  const body = summary.trim().slice(0, 600);
  return {
    summary: wrong.length ? `${body} Misconceptions noticed: ${wrong.join("; ")}.` : body,
    strengths: typeof strengths === "string" ? strengths.trim().slice(0, 300) : "",
    effectiveMethods,
  };
}

// Summarizes the session into a learner_notes row (teacherVisible stays at its default, false).
export async function finishDeepDive(claude: Claude, a: Ids) {
  await assertOwns(a.sessionId, a.studentId);
  const chat = await history(a.sessionId, TRANSCRIPT_CAP);
  if (!chat.length) throw new Error("deep-dive: no messages to summarize");
  const transcript = chat.map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`).join("\n");
  let note: Note | null = null;
  for (let i = 0; i < 2 && !note; i++) { // one retry on invalid output
    const r = await claude.messages.create({
      model: MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      output_config: EFFORT,
      system: NOTE_SYSTEM,
      messages: [{ role: "user", content: transcript }],
    });
    try { note = toNote(parseJson(text(r))); } catch { note = null; }
  }
  if (!note) throw new Error("deep-dive: model returned an invalid learner note twice");
  const [row] = await db.insert(learnerNotes).values({
    studentId: a.studentId, skillId: a.skillId, sessionId: a.sessionId,
    summary: note.summary, strengths: note.strengths, effectiveMethods: note.effectiveMethods,
  }).returning();
  return row;
}
