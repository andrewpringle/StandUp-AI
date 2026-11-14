export const GEN_MODEL = "claude-sonnet-5-5";
export const CHECK_MODEL = "claude-haiku-5-5";

// Minimal slice of the Anthropic client so tests can mock it.
export interface Claude {
  messages: {
    create(a: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: { role: "user"; content: string }[];
    }): Promise<{ content: { type: string; text?: string }[] }>;
  };
}

export type Check =
  | { kind: "equal"; answer_expr: string; choice_is_expr: true }
  | { kind: "solve"; equation: string; var: string; choice_is_value: true };

export interface Question {
  stem: string;
  choices: { A: string; B: string; C: string; D: string };
  correct: "A" | "B" | "C" | "D";
  explanation: string;
  difficulty_est: number;
  check?: Check;
}

const LETTERS = ["A", "B", "C", "D"] as const;
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function isQuestion(v: unknown, math: boolean): v is Question {
  const q = v as Question;
  if (!q || typeof q !== "object") return false;
  if (!isStr(q.stem) || !isStr(q.explanation)) return false;
  if (!q.choices || !LETTERS.every((l) => isStr(q.choices[l]))) return false;
  if (new Set(LETTERS.map((l) => q.choices[l].trim())).size !== LETTERS.length) return false; // duplicate options
  if (!LETTERS.includes(q.correct)) return false;
  if (typeof q.difficulty_est !== "number" || q.difficulty_est < -2 || q.difficulty_est > 2) return false;
  if (!math) return true;
  const c = q.check as Record<string, unknown> | undefined;
  if (c?.kind === "equal") return isStr(c.answer_expr) && c.choice_is_expr === true;
  if (c?.kind === "solve") return isStr(c.equation) && isStr(c.var) && c.choice_is_value === true;
  return false;
}

export const text = (r: { content: { type: string; text?: string }[] }) =>
  r.content.filter((b) => b.type === "text").map((b) => b.text).join("");

// Models sometimes wrap JSON in prose or fences; take the outermost braces.
export const parseJson = (s: string): unknown => {
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  return JSON.parse(s.slice(a, b + 1));
};

const SYSTEM = `You write ONE ACT/SAT-style 4-choice question as strict JSON only, no prose:
{"stem":"...","choices":{"A":"..","B":"..","C":"..","D":".."},"correct":"A|B|C|D","explanation":"...","difficulty_est":<number -2 (easy) to 2 (hard)>,"check":...}
Exactly one choice is correct; distractors reflect common mistakes.
For MATH skills include "check", either
 {"kind":"equal","answer_expr":"<sympy expression equal to the correct choice's value>","choice_is_expr":true}
 or {"kind":"solve","equation":"lhs = rhs","var":"x","choice_is_value":true}
and write choices as plain sympy-parsable expressions/values. For ENGLISH skills omit "check".`;

export interface SkillRow { name: string; topic: string; subject: string }

// `avoid` = stems already generated this run, so the model doesn't repeat itself.
export async function generate(claude: Claude, skill: SkillRow, difficulty: number, avoid: string[] = []): Promise<Question> {
  const math = skill.subject.toLowerCase() === "math";
  const repeats = avoid.length
    ? `\nDo not repeat or closely mimic these existing questions:\n${avoid.slice(-10).map((s) => `- ${s.slice(0, 120)}`).join("\n")}`
    : "";
  const r = await claude.messages.create({
    model: GEN_MODEL,
    max_tokens: 1000,
    system: SYSTEM,
    messages: [{ role: "user", content: `Subject: ${skill.subject}\nTopic: ${skill.topic}\nSkill: ${skill.name}\nTarget difficulty_est: ${difficulty}${repeats}` }],
  });
  let q: unknown;
  try { q = parseJson(text(r)); } catch { throw new Error("generator returned invalid JSON"); }
  if (!isQuestion(q, math)) throw new Error("generator JSON failed validation");
  return q;
}
