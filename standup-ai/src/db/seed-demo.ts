import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "./index";
import { questions, skills } from "./schema";

// Hand-written demo questions so the app works without paid generation.
// Math `check` objects follow the contract in scripts/verify/verify.py; choices are raw sympy strings there
// and get prettified for display. Run `npm run db:seed` first (skills), then `npm run db:seed-demo`.
type Check =
  | { kind: "equal"; answer_expr: string; choice_is_expr: true }
  | { kind: "solve"; equation: string; var: string; choice_is_value: true };

export interface DemoQuestion {
  skill: string; // skills.slug
  difficulty: number; // -2..2, same scale as questions.difficulty_est
  stem: string;
  choices: string[];
  correct: number; // index into choices
  explanation: string;
  check?: Check; // math only
}

const eq1 = (answer_expr: string): Check => ({ kind: "equal", answer_expr, choice_is_expr: true });
const solve = (equation: string): Check => ({ kind: "solve", equation, var: "x", choice_is_value: true });

export const DEMO: DemoQuestion[] = [
  // ---- Math ----
  { skill: "lin-multi-step", difficulty: -1.5, stem: "Solve for x: 3x + 5 = 20.",
    choices: ["25/3", "5", "-5", "15"], correct: 1, check: solve("3*x+5 = 20"),
    explanation: "Subtract 5 from both sides: 3x = 15, so x = 5." },
  { skill: "lin-multi-step", difficulty: -0.3, stem: "Solve for x: 4(x − 3) + 2 = 22.",
    choices: ["10", "8", "23/4", "6"], correct: 1, check: solve("4*(x-3)+2 = 22"),
    explanation: "Distribute: 4x − 12 + 2 = 22, so 4x = 32 and x = 8." },
  { skill: "lin-both-sides", difficulty: -0.8, stem: "Solve for x: 5x − 7 = 2x + 11.",
    choices: ["-6", "3", "18/7", "6"], correct: 3, check: solve("5*x-7 = 2*x+11"),
    explanation: "Subtract 2x: 3x − 7 = 11. Add 7: 3x = 18, so x = 6." },
  { skill: "lin-both-sides", difficulty: 0.4, stem: "Solve for x: 3(2x − 1) = 4x + 7.",
    choices: ["4", "2", "5", "10"], correct: 2, check: solve("3*(2*x-1) = 4*x+7"),
    explanation: "Distribute: 6x − 3 = 4x + 7. Then 2x = 10, so x = 5." },
  { skill: "poly-add-sub", difficulty: -1.0, stem: "Simplify (3x² + 2x − 5) + (x² − 4x + 9).",
    choices: ["4x^2+6x+4", "4x^2-2x-4", "4x^2-2x+4", "4x^4-2x+4"], correct: 2, check: eq1("4*x^2-2*x+4"),
    explanation: "Combine like terms: 3x² + x² = 4x², 2x − 4x = −2x, −5 + 9 = 4." },
  { skill: "poly-add-sub", difficulty: 0.0, stem: "Subtract: (5x² − 3x + 7) − (2x² + x − 4).",
    choices: ["3x^2-4x+11", "3x^2-2x+3", "3x^2-4x+3", "7x^2-2x+3"], correct: 0, check: eq1("3*x^2-4*x+11"),
    explanation: "Distribute the minus sign: 5x² − 2x² = 3x², −3x − x = −4x, 7 + 4 = 11." },
  { skill: "poly-multiply", difficulty: -1.2, stem: "What is (x + 2)(x + 3) in expanded form?",
    choices: ["x^2+6x+5", "x^2+5x+5", "2x+5", "x^2+5x+6"], correct: 3, check: eq1("x^2+5*x+6"),
    explanation: "FOIL: x² + 3x + 2x + 6 = x² + 5x + 6." },
  { skill: "poly-multiply", difficulty: 0.2, stem: "Expand (2x − 3)(x + 4).",
    choices: ["2x^2+5x-12", "2x^2-5x-12", "2x^2+11x-12", "2x^2+5x+12"], correct: 0, check: eq1("2*x^2+5*x-12"),
    explanation: "2x² + 8x − 3x − 12 = 2x² + 5x − 12." },
  { skill: "poly-divide", difficulty: -0.5, stem: "What is (x² − 9) ÷ (x − 3)?",
    choices: ["x-3", "x+9", "x+3", "x^2+3"], correct: 2, check: eq1("x+3"),
    explanation: "x² − 9 = (x − 3)(x + 3), so the quotient is x + 3." },
  { skill: "poly-divide", difficulty: 1.3, stem: "What is (x³ − 8) ÷ (x − 2)?",
    choices: ["x^2-2x+4", "x^2+2x-4", "x^2+4", "x^2+2x+4"], correct: 3, check: eq1("x^2+2*x+4"),
    explanation: "Difference of cubes: x³ − 8 = (x − 2)(x² + 2x + 4)." },
  { skill: "poly-factor", difficulty: -0.6, stem: "Which expression is equivalent to x² + 7x + 12?",
    choices: ["(x+2)*(x+6)", "(x+3)*(x+4)", "(x+1)*(x+12)", "(x-3)*(x-4)"], correct: 1, check: eq1("x^2+7*x+12"),
    explanation: "Find two numbers that multiply to 12 and add to 7: 3 and 4." },
  { skill: "poly-factor", difficulty: 1.0, stem: "Which expression is equivalent to 2x² + 7x + 3?",
    choices: ["(2*x+3)*(x+1)", "(2*x-1)*(x-3)", "(x+7)*(2*x+3)", "(2*x+1)*(x+3)"], correct: 3, check: eq1("2*x^2+7*x+3"),
    explanation: "(2x + 1)(x + 3) = 2x² + 6x + x + 3 = 2x² + 7x + 3." },
  { skill: "quad-by-factoring", difficulty: -0.2, stem: "Which value of x is a solution of x² − 5x + 6 = 0?",
    choices: ["-2", "5", "2", "-3"], correct: 2, check: solve("x^2-5*x+6 = 0"),
    explanation: "x² − 5x + 6 = (x − 2)(x − 3), so x = 2 or x = 3. Only 2 is listed." },
  { skill: "quad-by-factoring", difficulty: 0.7, stem: "Which value of x is a solution of x² + 2x − 15 = 0?",
    choices: ["5", "-3", "15", "-5"], correct: 3, check: solve("x^2+2*x-15 = 0"),
    explanation: "x² + 2x − 15 = (x + 5)(x − 3), so x = −5 or x = 3. Only −5 is listed." },
  { skill: "poly-special-products", difficulty: -0.4, stem: "Expand (x + 5)².",
    choices: ["x^2+25", "x^2+10x+25", "x^2+5x+25", "x^2+10x+10"], correct: 1, check: eq1("x^2+10*x+25"),
    explanation: "(x + 5)² = x² + 2·5·x + 25 = x² + 10x + 25. The middle term is not skipped." },
  { skill: "poly-special-products", difficulty: 0.6, stem: "Which expression is equivalent to 9x² − 16?",
    choices: ["(3*x-4)^2", "(9*x-16)*(x+1)", "(3*x+4)^2", "(3*x-4)*(3*x+4)"], correct: 3, check: eq1("9*x^2-16"),
    explanation: "Difference of squares: 9x² − 16 = (3x)² − 4² = (3x − 4)(3x + 4)." },

  // ---- English (answer keys hand-checked only; no script verifies these) ----
  { skill: "punc-comma-splice", difficulty: -1.0, stem: "Which sentence is punctuated correctly?",
    choices: [
      "The bus was late, we missed the first class.",
      "The bus was late; we missed the first class.",
      "The bus was late we missed the first class.",
      "The bus, was late we missed the first class.",
    ], correct: 1,
    explanation: "Two complete sentences need a semicolon, a period, or a comma plus a conjunction. A comma alone is a comma splice." },
  { skill: "punc-comma-splice", difficulty: 0.4, stem: "Which version of this sentence is correct? \"She loves hiking, her brother prefers swimming.\"",
    choices: [
      "She loves hiking, but her brother prefers swimming.",
      "She loves hiking, her brother prefers swimming.",
      "She loves hiking her brother prefers swimming.",
      "She loves hiking, however her brother prefers swimming.",
    ], correct: 0,
    explanation: "A comma plus \"but\" joins the two clauses. \"However\" is not a conjunction, so a comma before it still leaves a splice." },
  { skill: "punc-semicolon", difficulty: -0.5, stem: "Which sentence uses a semicolon correctly?",
    choices: [
      "I studied all night; and I felt ready.",
      "I studied; all night I felt ready.",
      "I studied all night; I felt ready.",
      "Because I studied all night; I felt ready.",
    ], correct: 2,
    explanation: "A semicolon joins two independent clauses. The other options put it before a conjunction, inside a clause, or after a dependent clause." },
  { skill: "punc-semicolon", difficulty: 1.0, stem: "Which choice correctly completes the sentence? \"The conference featured speakers from three countries ___ Japan, Brazil, and Kenya.\"",
    choices: [
      "The conference featured speakers from three countries; Japan, Brazil, and Kenya.",
      "The conference featured speakers from three countries. Japan, Brazil, and Kenya.",
      "The conference featured speakers from three countries Japan, Brazil, and Kenya.",
      "The conference featured speakers from three countries: Japan, Brazil, and Kenya.",
    ], correct: 3,
    explanation: "A colon introduces a list after a complete sentence. A semicolon needs a complete clause on both sides." },
  { skill: "punc-apostrophe", difficulty: -1.2, stem: "Which sentence is correct?",
    choices: [
      "Its a beautiful day outside.",
      "It's a beautiful day outside.",
      "Its' a beautiful day outside.",
      "It's' a beautiful day outside.",
    ], correct: 1,
    explanation: "\"It's\" is the contraction of \"it is\". \"Its\" without an apostrophe is a possessive." },
  { skill: "punc-apostrophe", difficulty: 0.3, stem: "Which sentence uses the apostrophe correctly?",
    choices: [
      "The childrens' toys were scattered across the floor.",
      "The childrens toys were scattered across the floor.",
      "The children's' toys were scattered across the floor.",
      "The children's toys were scattered across the floor.",
    ], correct: 3,
    explanation: "\"Children\" is already plural, so the possessive is \"children's\"." },
  { skill: "punc-nonessential", difficulty: 0.0, stem: "Which sentence is punctuated correctly?",
    choices: [
      "Mount Everest, which is the tallest mountain on Earth attracts thousands of climbers.",
      "Mount Everest which is the tallest mountain on Earth, attracts thousands of climbers.",
      "Mount Everest, which is the tallest mountain on Earth, attracts thousands of climbers.",
      "Mount Everest which is the tallest mountain on Earth attracts thousands of climbers.",
    ], correct: 2,
    explanation: "The \"which\" clause adds extra information, so commas go on both sides of it." },
  { skill: "punc-nonessential", difficulty: 1.2, stem: "Only the students who finish early are allowed to leave. Which sentence says this with correct punctuation?",
    choices: [
      "Students, who finish early, may leave quietly.",
      "Students who finish early may leave quietly.",
      "Students who finish early, may leave quietly.",
      "Students, who finish early may leave quietly.",
    ], correct: 1,
    explanation: "\"Who finish early\" is essential: it says which students may leave. Essential clauses take no commas." },
];

// Raw sympy strings -> classroom notation: x^2 -> x², 2*x -> 2x, )*( -> )(, spaces around + and -.
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
export const pretty = (s: string) =>
  s
    .replace(/\^(\d)/g, (_, d: string) => SUP[Number(d)])
    .replace(/\)\*\(/g, ")(")
    .replace(/(\d)\*([a-z])/g, "$1$2")
    .replace(/(?<=[^\s(])([+-])(?=\S)/g, " $1 ");

export async function seedDemoQuestions(): Promise<number> {
  const slugs = [...new Set(DEMO.map((q) => q.skill))];
  const rows = await db.select({ id: skills.id, slug: skills.slug }).from(skills).where(inArray(skills.slug, slugs));
  const idOf = new Map(rows.map((r) => [r.slug, r.id]));
  const missing = slugs.filter((s) => !idOf.has(s));
  if (missing.length) throw new Error(`skills not seeded (${missing.join(", ")}). Run npm run db:seed first.`);

  let added = 0;
  for (const q of DEMO) {
    const skillId = idOf.get(q.skill)!;
    const [dupe] = await db.select({ id: questions.id }).from(questions)
      .where(and(eq(questions.skillId, skillId), eq(questions.stem, q.stem)));
    if (dupe) continue; // idempotent: re-running adds nothing
    await db.insert(questions).values({
      questionKey: randomUUID(),
      skillId,
      stem: q.stem,
      choices: q.check ? q.choices.map(pretty) : q.choices,
      correct: q.correct,
      explanation: q.explanation,
      difficultyEst: q.difficulty,
      difficultyB: q.difficulty,
      calibrationN: 0,
      status: "verified",
      verification: { method: q.check ? "hand-written; sympy-checked" : "hand-written" },
    });
    added++;
  }
  return added;
}

if (process.argv[1]?.endsWith("seed-demo.ts")) {
  seedDemoQuestions()
    .then((n) => console.log(`added ${n} demo questions`))
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
    .finally(() => pool.end());
}
