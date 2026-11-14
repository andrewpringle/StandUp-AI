import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, type ErrorCode } from "../../../server/contracts";

const fake = vi.hoisted(() => ({
  nextQuestion: vi.fn(), submitAnswer: vi.fn(), reviewWork: vi.fn(), getReviewItems: vi.fn(),
  toggleFlag: vi.fn(), tutorMessage: vi.fn(), finishTutor: vi.fn(), getProgress: vi.fn(),
}));
vi.mock("../../../server", () => fake);

import { GET as progress } from "./progress/route";
import { GET as reviewItems } from "./review-items/route";
import { POST as answer } from "./quiz/answer/route";
import { POST as flag } from "./quiz/flag/route";
import { POST as next } from "./quiz/next/route";
import { POST as review } from "./quiz/review/route";
import { POST as finish } from "./tutor/finish/route";
import { POST as message } from "./tutor/message/route";

const URL_ = "http://localhost:3000/api/live/x";
const post = (body: unknown, origin = "http://localhost:3000") =>
  new Request(URL_, { method: "POST", headers: { "Content-Type": "application/json", origin }, body: typeof body === "string" ? body : JSON.stringify(body) });
const get = (qs = "", origin?: string) => new Request(URL_ + qs, { headers: origin ? { origin } : {} });

// Every endpoint, with a valid request and the server function it must call.
const posts = [
  ["quiz/next", next, { sessionId: "s" }, fake.nextQuestion],
  ["quiz/answer", answer, { sessionId: "s", questionId: "q", chosen: 1, clientAttemptId: "c" }, fake.submitAnswer],
  ["quiz/review", review, { questionId: "q", work: "w" }, fake.reviewWork],
  ["quiz/flag", flag, { questionId: "q", flagged: true }, fake.toggleFlag],
  ["tutor/message", message, { questionId: "q", message: "hi" }, fake.tutorMessage],
  ["tutor/finish", finish, { sessionId: "s", questionId: "q" }, fake.finishTutor],
] as const;
const all = [...posts.map(([n, h, b]) => [n, h, () => post(b)] as const), ["progress", progress, () => get()] as const, ["review-items", reviewItems, () => get()] as const];

beforeEach(() => { vi.stubEnv("STANDUP_LIVE_BACKEND", "true"); Object.values(fake).forEach((f) => f.mockReset().mockResolvedValue({ ok: 1 })); });
afterEach(() => vi.unstubAllEnvs());

describe("gate and request checks run before any server call", () => {
  it.each(all)("%s: gate off -> 503, nothing called", async (_n, h, req) => {
    vi.stubEnv("STANDUP_LIVE_BACKEND", "false");
    const res = await h(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "NO_KEY", message: "The live backend is not enabled." } });
    Object.values(fake).forEach((f) => expect(f).not.toHaveBeenCalled());
  });

  it.each(all)("%s: cross-origin -> 403, nothing called", async (n, h) => {
    const bad = "https://evil.example";
    const res = await h(posts.some(([p]) => p === n) ? post(posts.find(([p]) => p === n)![2], bad) : get("", bad));
    expect(res.status).toBe(403);
    Object.values(fake).forEach((f) => expect(f).not.toHaveBeenCalled());
  });

  it("oversized body -> 413; bad JSON, arrays and scalars -> 400", async () => {
    expect((await next(post({ sessionId: "x".repeat(9000) }))).status).toBe(413);
    for (const bad of ["{nope", "", "[1]", "5", "null"]) expect((await next(post(bad))).status).toBe(400);
    expect(fake.nextQuestion).not.toHaveBeenCalled();
  });
});

describe("error mapping", () => {
  it.each([["BAD_INPUT", 400], ["NOT_FOUND", 404], ["NO_KEY", 503], ["SPEND_CAP", 429], ["MODEL", 502]] as [ErrorCode, number][])(
    "%s -> %i with only the safe message", async (code, status) => {
      fake.nextQuestion.mockRejectedValue(new AppError(code, "Safe text."));
      const res = await next(post({}));
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: { code, message: "Safe text." } });
    });

  it("any other error -> 500 generic, internals only logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.getProgress.mockRejectedValue(new Error("db password=hunter2 at /srv/app.ts:1"));
    const res = await progress(get());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/hunter2|\.ts|stack/);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("success", () => {
  it.each(all)("%s: passes the result through unchanged with no-store", async (n, h, req) => {
    const res = await h(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(n === "review-items" ? { items: { ok: 1 } } : { ok: 1 });
  });

  it.each(posts)("%s calls its server function with exactly the body fields", async (_n, h, body, fn) => {
    await h(post(body));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toEqual(_n === "quiz/next" ? "s" : body);
  });

  it("answer forwards timeMs only when the client sent it", async () => {
    const base = { sessionId: "s", questionId: "q", chosen: 0, clientAttemptId: "c" };
    await answer(post(base));
    expect(Object.keys(fake.submitAnswer.mock.calls[0][0]).sort()).toEqual(["chosen", "clientAttemptId", "questionId", "sessionId"]);
    await answer(post({ ...base, timeMs: 1200 }));
    expect(fake.submitAnswer.mock.calls[1][0].timeMs).toBe(1200);
  });

  it("next with no sessionId passes undefined; extra body fields are ignored", async () => {
    await next(post({ evil: "x" }));
    expect(fake.nextQuestion).toHaveBeenCalledWith(undefined);
  });

  it("review-items passes skillId through, and the response is exactly {items} with no key fields", async () => {
    const item = { questionId: "q", skillId: "k", skillName: "n", topic: "t", stem: "s", choices: ["a"], chosen: 0, wasCorrect: false, flagged: false, done: false, answeredAt: "d" };
    fake.getReviewItems.mockResolvedValue([item]);
    const body = await (await reviewItems(get("?skillId=abc"))).json();
    expect(fake.getReviewItems).toHaveBeenCalledWith("abc");
    expect(Object.keys(body)).toEqual(["items"]);
    expect(JSON.stringify(body)).not.toMatch(/correctIndex|"correct"|explanation/);
    await reviewItems(get());
    expect(fake.getReviewItems).toHaveBeenLastCalledWith(undefined);
  });
});
