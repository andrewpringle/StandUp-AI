import { describe, expect, it } from "vitest";
import { Ability, Attempt, Candidate, config, decaySigma, isMastered, pickSkillForDiagnostic, predict, selectQuestion, update } from "./index";

// Deterministic PRNG so the simulations don't flake.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const bank: Candidate[] = Array.from({ length: 41 }, (_, i) => ({ id: `q${i}`, b: -2 + i * 0.1 }));

// trueTheta drives answers; `noise` is the chance of flipping the outcome.
function simulate(trueTheta: number, n: number, noise = 0, seed = 1, sessionEvery = 5) {
  const rand = rng(seed);
  let s: Ability = { theta: 0, sigma: config.sigmaInit };
  const attempts: Attempt[] = [];
  for (let i = 0; i < n; i++) {
    const q = selectQuestion(s, bank)!;
    let correct = rand() < predict(trueTheta, q.b);
    if (rand() < noise) correct = !correct;
    attempts.push({ b: q.b, correct, sessionId: `s${Math.floor(i / sessionEvery)}` });
    s = update(s, q.b, correct);
  }
  return { s, attempts };
}

describe("engine", () => {
  it("predict is a sigmoid", () => {
    expect(predict(0, 0)).toBeCloseTo(0.5);
    expect(predict(2, 0)).toBeGreaterThan(0.85);
  });

  it("update moves theta the right way and shrinks sigma", () => {
    const s = { theta: 0, sigma: 1 };
    expect(update(s, 0, true).theta).toBeGreaterThan(0);
    expect(update(s, 0, false).theta).toBeLessThan(0);
    expect(update(s, 0, true).sigma).toBeLessThan(1);
  });

  it("selects the question nearest the target P and skips seen ones", () => {
    const s = { theta: 0, sigma: 1 };
    const pick = selectQuestion(s, bank)!;
    expect(Math.abs(predict(0, pick.b) - config.targetP)).toBeLessThan(0.03);
    expect(selectQuestion(s, bank, new Set([pick.id]))!.id).not.toBe(pick.id);
  });

  it("picks the highest-sigma skill for the diagnostic", () => {
    expect(pickSkillForDiagnostic([{ sigma: 0.4 }, { sigma: 1.4 }, { sigma: 0.9 }])).toEqual({ sigma: 1.4 });
  });

  it("orders strong > noisy-strong > weak after ~40 attempts and sigma shrinks", () => {
    const strong = simulate(2, 40);
    const weak = simulate(-2, 40);
    const noisy = simulate(2, 40, 0.3);
    expect(strong.s.theta).toBeGreaterThan(weak.s.theta + 1);
    expect(noisy.s.theta).toBeLessThan(strong.s.theta);
    expect(noisy.s.theta).toBeGreaterThan(weak.s.theta);
    for (const r of [strong, weak, noisy]) expect(r.s.sigma).toBeLessThan(config.sigmaInit);
  });

  it("a strong student reaches mastery, a weak one does not", () => {
    expect(isMastered(simulate(2.5, 40).s, simulate(2.5, 40).attempts)).toBe(true);
    const weak = simulate(-2, 40);
    expect(isMastered(weak.s, weak.attempts)).toBe(false);
  });

  it("answering only easy questions never reaches mastery", () => {
    let s: Ability = { theta: 0, sigma: config.sigmaInit };
    const attempts: Attempt[] = [];
    for (let i = 0; i < 60; i++) {
      s = update(s, -2, true);
      attempts.push({ b: -2, correct: true, sessionId: `s${i % 4}` });
    }
    expect(isMastered(s, attempts)).toBe(false);
  });

  it("mastery needs at least two sessions", () => {
    const { s, attempts } = simulate(2.5, 40);
    expect(isMastered(s, attempts.map((a) => ({ ...a, sessionId: "one" })))).toBe(false);
  });

  it("a long gap raises sigma", () => {
    const { s } = simulate(2, 40);
    expect(decaySigma(s, 60).sigma).toBeGreaterThan(s.sigma);
    expect(decaySigma(s, 0).sigma).toBe(s.sigma);
  });
});
