// Static demo data only. No backend; replace with real queries later.
export type MasteryState = "unseen" | "learning" | "mastered" | "needs_review";

export const skills = [
  { topic: "Algebra > Polynomials", name: "Polynomial multiplication", state: "mastered" as MasteryState, pct: 100 },
  { topic: "Algebra > Polynomials", name: "Polynomial division", state: "learning" as MasteryState, pct: 55 },
  { topic: "Algebra > Polynomials", name: "Factoring", state: "needs_review" as MasteryState, pct: 70 },
  { topic: "Algebra > Polynomials", name: "Solving by factoring", state: "unseen" as MasteryState, pct: 0 },
  { topic: "Grammar > Punctuation", name: "Comma splices", state: "mastered" as MasteryState, pct: 100 },
  { topic: "Grammar > Punctuation", name: "Semicolons", state: "learning" as MasteryState, pct: 40 },
  { topic: "Grammar > Punctuation", name: "Apostrophes", state: "unseen" as MasteryState, pct: 0 },
];

export const abilityHistory = [
  { week: "Wk 1", Polynomials: -0.9, Punctuation: -0.4 },
  { week: "Wk 2", Polynomials: -0.5, Punctuation: -0.1 },
  { week: "Wk 3", Polynomials: -0.1, Punctuation: 0.2 },
  { week: "Wk 4", Polynomials: 0.2, Punctuation: 0.5 },
  { week: "Wk 5", Polynomials: 0.6, Punctuation: 0.7 },
];

export const testScores = [
  { test: "Diagnostic", score: 1020 },
  { test: "Practice 1", score: 1090 },
  { test: "Practice 2", score: 1150 },
  { test: "Real SAT", score: 1180 },
  { test: "Retake", score: 1260 },
];

export const leaderboard = [
  { name: "Falcon-12", points: 840, improvement: "+18%" },
  { name: "Maple-07", points: 790, improvement: "+15%" },
  { name: "You", points: 740, improvement: "+14%" },
  { name: "Comet-33", points: 705, improvement: "+11%" },
  { name: "Otter-21", points: 660, improvement: "+9%" },
];

export type Question = { id: number; skill: string; difficulty: 1 | 2 | 3; stem: string; choices: string[]; correct: number; explanation: string };

export const questions: Question[] = [
  { id: 1, skill: "Polynomial multiplication", difficulty: 1, stem: "What is (x + 2)(x + 3)?", choices: ["x² + 5x + 6", "x² + 6x + 5", "x² + 5x + 5", "2x + 5"], correct: 0, explanation: "FOIL: x² + 3x + 2x + 6 = x² + 5x + 6." },
  { id: 2, skill: "Polynomial division", difficulty: 2, stem: "What is (x² - 9) ÷ (x - 3)?", choices: ["x - 3", "x + 3", "x + 9", "x² + 3"], correct: 1, explanation: "x² - 9 = (x - 3)(x + 3), so the quotient is x + 3." },
  { id: 3, skill: "Semicolons", difficulty: 2, stem: "Which sentence is punctuated correctly?", choices: ["I studied all night; I felt ready.", "I studied all night; and I felt ready.", "I studied; all night I felt ready.", "I studied all night, I felt ready."], correct: 0, explanation: "A semicolon joins two independent clauses. Option D is a comma splice." },
  { id: 4, skill: "Factoring", difficulty: 3, stem: "Which is the factored form of 2x² + 7x + 3?", choices: ["(2x + 1)(x + 3)", "(2x + 3)(x + 1)", "(x + 7)(2x + 3)", "(2x - 1)(x - 3)"], correct: 0, explanation: "(2x + 1)(x + 3) = 2x² + 6x + x + 3 = 2x² + 7x + 3." },
];

export type ChatMsg = { from: "student" | "tutor"; text: string };
export const chats: Record<"quiz" | "deepdive", { msgs: ChatMsg[]; note?: string }> = {
  quiz: {
    msgs: [
      { from: "tutor", text: "Your polynomial division is at 55%. I'll give you 3 medium questions, then one harder one." },
      { from: "student", text: "ok let's go" },
      { from: "tutor", text: "Q1: What is (x² - 9) ÷ (x - 3)? Take your time." },
    ],
  },
  deepdive: {
    msgs: [
      { from: "tutor", text: "You missed the factoring question. Can you walk me through your first step?" },
      { from: "student", text: "I multiplied 2 and 3 to get 6, then looked for factors of 6 that add to 7." },
      { from: "tutor", text: "Good start. That works when the leading coefficient is 1. What changes when it's 2x²?" },
      { from: "student", text: "oh... I have to use the 2 too?" },
      { from: "tutor", text: "Right. Try splitting 7x into two terms whose coefficients multiply to 2 x 3 = 6. Which pair works?" },
    ],
    note: "Misconception: applies the a=1 factoring shortcut when a≠1. Works well with worked examples and step-by-step splitting.",
  },
};

export const classRoster = [
  { name: "Falcon-12", poly: "mastered", punct: "learning", points: 840 },
  { name: "Maple-07", poly: "learning", punct: "mastered", points: 790 },
  { name: "You (demo)", poly: "learning", punct: "learning", points: 740 },
  { name: "Comet-33", poly: "needs_review", punct: "learning", points: 705 },
  { name: "Otter-21", poly: "unseen", punct: "unseen", points: 660 },
];

export const learnerNotes = [
  { student: "Comet-33", skill: "Factoring", note: "Applies a=1 shortcut to a≠1 trinomials. Responds well to worked examples.", date: "Nov 12" },
  { student: "Otter-21", skill: "Semicolons", note: "Confuses semicolons with colons. Visual sentence-diagram hints helped.", date: "Nov 11" },
  { student: "Maple-07", skill: "Polynomial division", note: "Strong on long division; forgets sign flips when subtracting.", date: "Nov 10" },
];
