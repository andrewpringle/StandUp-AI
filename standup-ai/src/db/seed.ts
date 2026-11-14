import { db, pool } from "./index";
import { skillPrereqs, skills } from "./schema";

// [slug, subject, topic, name, prereq slugs]
const S: [string, string, string, string, string[]][] = [
  ["lin-one-step", "Math", "Algebra: Linear Equations", "One-step equations", []],
  ["lin-multi-step", "Math", "Algebra: Linear Equations", "Multi-step equations", ["lin-one-step"]],
  ["lin-both-sides", "Math", "Algebra: Linear Equations", "Variables on both sides", ["lin-multi-step"]],
  ["poly-add-sub", "Math", "Algebra: Polynomials", "Polynomial addition and subtraction", ["lin-multi-step"]],
  ["poly-multiply", "Math", "Algebra: Polynomials", "Polynomial multiplication", ["poly-add-sub"]],
  ["poly-divide", "Math", "Algebra: Polynomials", "Polynomial division", ["poly-multiply"]],
  ["poly-factor", "Math", "Algebra: Polynomials", "Factoring polynomials", ["poly-multiply"]],
  ["quad-by-factoring", "Math", "Algebra: Polynomials", "Solving quadratics by factoring", ["poly-factor", "lin-both-sides"]],
  ["poly-special-products", "Math", "Algebra: Polynomials", "Special products (difference of squares, perfect squares)", ["poly-multiply"]],
  ["punc-comma-splice", "English", "Grammar: Punctuation", "Comma splices and run-ons", []],
  ["punc-semicolon", "English", "Grammar: Punctuation", "Semicolons and colons", ["punc-comma-splice"]],
  ["punc-apostrophe", "English", "Grammar: Punctuation", "Apostrophes (possession vs. contraction)", []],
  ["punc-comma-lists", "English", "Grammar: Punctuation", "Commas in lists and introductory phrases", []],
  ["punc-nonessential", "English", "Grammar: Punctuation", "Commas with nonessential clauses", ["punc-comma-lists"]],
  ["punc-dashes", "English", "Grammar: Punctuation", "Dashes and parentheses", ["punc-nonessential"]],
  ["punc-fragments", "English", "Grammar: Punctuation", "Sentence fragments", ["punc-comma-splice"]],
];

async function main() {
  const rows = await db
    .insert(skills)
    .values(S.map(([slug, subject, topic, name]) => ({ slug, subject, topic, name })))
    .onConflictDoNothing()
    .returning({ id: skills.id, slug: skills.slug });
  const all = rows.length === S.length ? rows : await db.select({ id: skills.id, slug: skills.slug }).from(skills);
  const idOf = Object.fromEntries(all.map((r) => [r.slug, r.id]));

  await db
    .insert(skillPrereqs)
    .values(S.flatMap(([slug, , , , pre]) => pre.map((p) => ({ skillId: idOf[slug], prereqId: idOf[p] }))))
    .onConflictDoNothing();

  console.log(`seeded ${S.length} skills`);
  await pool.end();
}

main();
