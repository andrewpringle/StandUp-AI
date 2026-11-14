import { spawn } from "node:child_process";
import { join } from "node:path";
import { CHECK_MODEL, text, type Claude, type Question } from "./generate";

// Absolute paths so the CLI works from any folder. shortcut: POSIX venv layout, Windows uses Scripts/python.exe.
const ROOT = join(import.meta.dirname, "../..");

export interface Verdict { ok: boolean; reason: string }

// Math: python/sympy verifier built by another workstream (scripts/verify).
export function verifyMath(q: Question): Promise<Verdict> {
  return new Promise((resolve) => {
    const p = spawn(join(ROOT, "scripts/verify/.venv/bin/python"), [join(ROOT, "scripts/verify/verify.py")]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", (e) => resolve({ ok: false, reason: `verifier failed to start: ${e.message}` }));
    p.on("close", () => {
      try { resolve(JSON.parse(out)); } catch { resolve({ ok: false, reason: `verifier bad output: ${out.slice(0, 200)}` }); }
    });
    p.stdin.on("error", () => {}); // spawn failure surfaces via 'error'/'close'
    p.stdin.end(JSON.stringify(q));
  });
}

// English: a second model answers blind (no key, no explanation) and must match the key.
export async function verifyEnglish(claude: Claude, q: Question): Promise<Verdict> {
  const { A, B, C, D } = q.choices;
  const r = await claude.messages.create({
    model: CHECK_MODEL,
    max_tokens: 5,
    messages: [{ role: "user", content: `${q.stem}\nA) ${A}\nB) ${B}\nC) ${C}\nD) ${D}\nReply with only the letter of the single best answer.` }],
  });
  const pick = text(r).trim().charAt(0).toUpperCase();
  return pick === q.correct
    ? { ok: true, reason: "blind answer matched key" }
    : { ok: false, reason: `blind answer ${pick || "none"} != key ${q.correct}` };
}

export const verify = (claude: Claude, q: Question, math: boolean) =>
  math ? verifyMath(q) : verifyEnglish(claude, q);
