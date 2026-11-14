import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { questions, skills } from "../db/schema";
import { generate, type Claude, type SkillRow } from "./generate";
import { verify } from "./verify";

type Row = typeof questions.$inferInsert;

// Returns the value after `--k`, or undefined when the flag is absent.
export const parseArg = (argv: string[], k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i < 0 ? undefined : argv[i + 1];
};

// Difficulty sweeps -2..2 across the batch; a batch of one gets the middle.
export const difficultyAt = (i: number, n: number) => (n === 1 ? 0 : -2 + (4 * i) / (n - 1));

// Generate one question and return the row to insert. Bad model output returns null (and is logged);
// auth errors (401/403) are rethrown so a bad key stops the run instead of failing n times.
export async function makeRow(
  claude: Claude, skillId: string, skill: SkillRow, difficulty: number, avoid: string[] = [],
): Promise<Row | null> {
  const math = skill.subject.toLowerCase() === "math";
  let q;
  try {
    q = await generate(claude, skill, difficulty, avoid);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) throw e;
    console.error("generation failed:", e instanceof Error ? e.message : e);
    return null; // nothing to store
  }
  const v = await verify(claude, q, math);
  return {
    questionKey: randomUUID(),
    skillId,
    stem: q.stem,
    choices: [q.choices.A, q.choices.B, q.choices.C, q.choices.D],
    correct: "ABCD".indexOf(q.correct),
    explanation: q.explanation,
    difficultyEst: q.difficulty_est,
    difficultyB: q.difficulty_est,
    calibrationN: 0,
    status: v.ok ? "verified" : "draft",
    verification: v,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const skillId = parseArg(process.argv, "skill");
  const n = Number(parseArg(process.argv, "n") ?? 20);
  if (!skillId || !UUID.test(skillId) || !Number.isInteger(n) || n < 1) {
    throw new Error("usage: gen:questions -- --skill <skill-uuid> [--n 20]");
  }
  const [skill] = await db.select().from(skills).where(eq(skills.id, skillId));
  if (!skill) throw new Error(`no skill ${skillId}`);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (put it in .env.local)");
  const claude = new Anthropic() as unknown as Claude;
  let ok = 0, draft = 0, failed = 0;
  const stems: string[] = [];
  for (let i = 0; i < n; i++) {
    const row = await makeRow(claude, skill.id, skill, difficultyAt(i, n), stems);
    if (!row) { failed++; continue; }
    await db.insert(questions).values(row);
    stems.push(row.stem);
    if (row.status === "verified") ok++; else draft++;
  }
  console.log({ verified: ok, draft, generationFailed: failed });
  await pool.end();
}

if (process.argv[1]?.endsWith("run.ts")) main().catch((e) => { console.error(e); process.exit(1); });
