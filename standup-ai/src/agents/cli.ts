import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import * as readline from "node:readline/promises";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { sessions, users } from "../db/schema";
import type { Claude } from "../pipeline/generate";
import { metered, SpendCapError } from "../pipeline/metered";
import { parseArg } from "../pipeline/run";
import { deepDiveTurn, finishDeepDive } from "./deepdive";
import { nextQuestion, reviewWork, submitAnswer } from "./quiz";

// Terminal harness for trying the Quiz + Deep-dive agents with real (paid) Haiku calls.
// Usage: npm run agent:demo -- [--student you@school.invalid] [--max-usd 0.25]
const LETTERS = "ABCD";

async function demoStudent(email: string) {
  const [found] = await db.select().from(users).where(eq(users.email, email));
  if (found) return found.id;
  const [u] = await db.insert(users).values({ role: "student", name: "Demo Student", email }).returning();
  return u.id;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (put it in .env.local)");
  const maxUsd = Number(parseArg(process.argv, "max-usd") ?? 0.25);
  const claude = metered(new Anthropic() as unknown as Claude, maxUsd);
  const studentId = await demoStudent(parseArg(process.argv, "student") ?? "demo-student@standup.invalid");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const [practice] = await db.insert(sessions).values({ studentId, mode: "practice" }).returning();
  const seen = new Set<string>();
  const spend = () => { const s = claude.stats(); return `[${s.calls} calls, ~$${s.usd.toFixed(4)} of $${maxUsd} cap]`; };

  try {
    for (;;) {
      const next = await nextQuestion(studentId, { seen });
      if (!next) { console.log("No verified questions left. Generate some: npm run gen:questions -- --skill <id> --n 10"); break; }
      const q = next.question;
      seen.add(q.id);
      console.log(`\n${q.stem}`);
      q.choices.forEach((c, i) => console.log(`  ${LETTERS[i]}) ${c}`));

      let chosen = -1;
      while (chosen < 0) {
        const a = (await rl.question("\nYour answer (A-D, or q to quit): ")).trim().toUpperCase();
        if (a === "Q") return;
        chosen = LETTERS.indexOf(a);
        if (a.length !== 1 || chosen < 0 || chosen >= q.choices.length) chosen = -1;
      }

      const res = await submitAnswer({
        studentId, sessionId: practice.id, questionId: q.id, chosen,
        clientAttemptId: randomUUID(), servedReason: next.servedReason,
      });
      console.log(res.correct ? "\nCorrect!" : "\nNot quite.");
      if (res.mastered) console.log("\nSkill mastered!");

      if (!res.correct) {
        const work = await rl.question("\nExplain your work (or press Enter to just see the answer):\n> ");
        const review = await reviewWork(work.trim() ? claude : null, { studentId, questionId: q.id, work });
        console.log(`\nThe answer is ${LETTERS[review.correctIndex]}.\n${review.feedback}`);
      }

      if (!res.correct && (await rl.question("\nTalk it through with the tutor? (y/N) ")).trim().toLowerCase() === "y") {
        const [dd] = await db.insert(sessions).values({ studentId, mode: "deepdive" }).returning();
        // Context carries the stem and the student's choice only, never the key.
        const questionContext = `${q.stem} The student chose: ${q.choices[chosen]}`;
        console.log("Tutor chat. Type /done to finish.");
        for (;;) {
          const m = (await rl.question("you> ")).trim();
          if (!m) continue;
          if (m === "/done") break;
          console.log(`tutor> ${await deepDiveTurn(claude, { sessionId: dd.id, studentId, skillId: q.skillId, studentMessage: m, questionContext })}`);
        }
        try {
          const note = await finishDeepDive(claude, { sessionId: dd.id, studentId, skillId: q.skillId });
          console.log(`\nLearner note saved: ${note.summary}`);
        } catch (e) {
          console.log(`\nNo note saved: ${e instanceof Error ? e.message : e}`);
        }
      }
      console.log(spend());
    }
  } catch (e) {
    if (!(e instanceof SpendCapError)) throw e;
    console.error(`\n${e.message}`);
  } finally {
    console.log(`\nDone. ${spend()}`);
    rl.close();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
