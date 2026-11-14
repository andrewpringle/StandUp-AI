// Rasch-style per-skill ability engine. Pure functions, no I/O. All numbers are untuned guesses.
export const config = {
  learningRate: 0.5, // step = learningRate * sigma * (actual - predicted)
  sigmaInit: 1.5,
  sigmaMin: 0.3,
  sigmaMax: 2,
  sigmaShrink: 0.93, // per attempt
  sigmaGrowthPerDay: 0.02,
  targetP: 0.68, // aim inside 0.6-0.75
  mastery: { window: 10, minAccuracy: 0.8, minHardCorrect: 2, minSessions: 2, maxSigma: 0.8, hardB: 0.5 },
};

export type Ability = { theta: number; sigma: number };
export type Candidate = { id: string; b: number };
export type Attempt = { b: number; correct: boolean; sessionId: string };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const predict = (theta: number, b: number) => 1 / (1 + Math.exp(-(theta - b)));

export function update(s: Ability, b: number, correct: boolean): Ability {
  const step = config.learningRate * s.sigma * ((correct ? 1 : 0) - predict(s.theta, b));
  return { theta: s.theta + step, sigma: clamp(s.sigma * config.sigmaShrink, config.sigmaMin, config.sigmaMax) };
}

export function decaySigma(s: Ability, daysSince: number): Ability {
  return { ...s, sigma: clamp(s.sigma + config.sigmaGrowthPerDay * Math.max(0, daysSince), config.sigmaMin, config.sigmaMax) };
}

// Closest predicted P to the target wins; questions in `seen` are skipped unless nothing else is left.
export function selectQuestion(s: Ability, candidates: Candidate[], seen: Set<string> = new Set()): Candidate | undefined {
  const fresh = candidates.filter((c) => !seen.has(c.id));
  const pool = fresh.length ? fresh : candidates;
  let best: Candidate | undefined;
  for (const c of pool) {
    if (!best || Math.abs(predict(s.theta, c.b) - config.targetP) < Math.abs(predict(s.theta, best.b) - config.targetP)) best = c;
  }
  return best;
}

// Count guards over the last `window` attempts, plus an uncertainty check so thin evidence can't pass.
export function isMastered(s: Ability, attempts: Attempt[]): boolean {
  const m = config.mastery;
  const recent = attempts.slice(-m.window);
  if (recent.length < m.window || s.sigma > m.maxSigma) return false;
  const acc = recent.filter((a) => a.correct).length / recent.length;
  const hard = recent.filter((a) => a.correct && a.b >= m.hardB).length;
  return acc >= m.minAccuracy && hard >= m.minHardCorrect && new Set(recent.map((a) => a.sessionId)).size >= m.minSessions;
}

export function pickSkillForDiagnostic<T extends { sigma: number }>(skills: T[]): T | undefined {
  return skills.reduce<T | undefined>((best, s) => (!best || s.sigma > best.sigma ? s : best), undefined);
}
