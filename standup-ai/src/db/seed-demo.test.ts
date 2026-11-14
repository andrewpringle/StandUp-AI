import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO, pretty } from "./seed-demo";

const ROOT = join(import.meta.dirname, "../..");
const PY = join(ROOT, "scripts/verify/.venv/bin/python");
const VERIFY = join(ROOT, "scripts/verify/verify.py");

const verify = (q: (typeof DEMO)[number]) => {
  const choices = Object.fromEntries(q.choices.map((c, i) => ["ABCD"[i], c]));
  const input = JSON.stringify({ correct: "ABCD"[q.correct], choices, check: q.check });
  return JSON.parse(execFileSync(PY, [VERIFY], { input, encoding: "utf8" })) as { ok: boolean; reason: string };
};

describe("demo questions", () => {
  it("has 24 questions across at least 10 skills", () => {
    expect(DEMO.length).toBeGreaterThanOrEqual(24);
    expect(new Set(DEMO.map((q) => q.skill)).size).toBeGreaterThanOrEqual(10);
  });

  it("has a valid shape: 4 distinct choices, valid key, difficulty in range, unique stems per skill", () => {
    for (const q of DEMO) {
      expect(q.choices, q.stem).toHaveLength(4);
      expect(new Set(q.choices.map((c) => c.trim())).size, q.stem).toBe(4);
      expect(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, q.stem).toBe(true);
      expect(q.difficulty).toBeGreaterThanOrEqual(-1.5);
      expect(q.difficulty).toBeLessThanOrEqual(1.5);
      expect(q.explanation, q.stem).not.toBe("");
    }
    const keys = DEMO.map((q) => `${q.skill}|${q.stem}`);
    expect(new Set(keys).size).toBe(keys.length); // the seed skips by (skill, stem)
  });

  it("every math answer key passes the sympy verifier", () => {
    const math = DEMO.filter((q) => q.check);
    expect(math.length).toBeGreaterThanOrEqual(16);
    for (const q of math) expect(verify(q), q.stem).toEqual({ ok: true, reason: "verified" });
  }, 60_000); // one Python process (and sympy import) per question

  it("the verifier rejects a deliberately wrong key (the check is live)", () => {
    const q = DEMO.find((d) => d.check)!;
    expect(verify({ ...q, correct: (q.correct + 1) % 4 }).ok).toBe(false);
  });

  it("prettifies math for display without changing meaning-bearing characters", () => {
    expect(pretty("(x+2)*(x+6)")).toBe("(x + 2)(x + 6)");
    expect(pretty("2x^2-5x-12")).toBe("2x² - 5x - 12");
    expect(pretty("(3*x-4)^2")).toBe("(3x - 4)²");
    expect(pretty("-5")).toBe("-5");
    expect(pretty("25/3")).toBe("25/3");
  });
});
