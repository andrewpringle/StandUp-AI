import { describe, expect, it, vi } from "vitest";
import { generate, type Claude } from "./generate";
import { verifyEnglish } from "./verify";

// Importing run.ts pulls in the db pool lazily; pool is only connected on use.
import { difficultyAt, makeRow, parseArg } from "./run";

const good = {
  stem: "Which sentence is punctuated correctly?",
  choices: { A: "a", B: "b", C: "c", D: "d" },
  correct: "B",
  explanation: "because",
  difficulty_est: 0.5,
};
const mock = (...replies: string[]): Claude => {
  const create = vi.fn();
  replies.forEach((t) => create.mockResolvedValueOnce({ content: [{ type: "text", text: t }] }));
  return { messages: { create } };
};
const eng = { name: "Semicolons", topic: "Punctuation", subject: "English" };

describe("pipeline", () => {
  it("rejects bad JSON and invalid shapes", async () => {
    await expect(generate(mock("not json"), eng, 0)).rejects.toThrow(/invalid JSON/);
    await expect(generate(mock(JSON.stringify({ ...good, correct: "Z" })), eng, 0)).rejects.toThrow(/validation/);
  });

  it("math question without a check is rejected", async () => {
    const math = { name: "Division", topic: "Polynomials", subject: "Math" };
    await expect(generate(mock(JSON.stringify(good)), math, 0)).rejects.toThrow(/validation/);
  });

  it("blind answer mismatch yields draft", async () => {
    const row = await makeRow(mock(JSON.stringify(good), "C"), "sid", eng, 0);
    expect(row?.status).toBe("draft");
    expect(row?.verification).toMatchObject({ ok: false });
  });

  it("blind answer match yields verified with b = est and key as index", async () => {
    const row = await makeRow(mock(JSON.stringify(good), "B"), "sid", eng, 0);
    expect(row).toMatchObject({ status: "verified", correct: 1, difficultyB: 0.5, calibrationN: 0 });
  });

  it("rejects duplicate choices", async () => {
    const dup = { ...good, choices: { A: "a", B: "a ", C: "c", D: "d" } };
    await expect(generate(mock(JSON.stringify(dup)), eng, 0)).rejects.toThrow(/validation/);
  });

  it("logs bad output and returns null; rethrows auth errors", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await makeRow(mock("not json"), "sid", eng, 0)).toBeNull();
    expect(err).toHaveBeenCalledWith("generation failed:", expect.stringMatching(/invalid JSON/));
    const denied: Claude = { messages: { create: vi.fn().mockRejectedValue(Object.assign(new Error("bad key"), { status: 401 })) } };
    await expect(makeRow(denied, "sid", eng, 0)).rejects.toThrow("bad key");
    err.mockRestore();
  });

  it("tells the generator which stems to avoid", async () => {
    const c = mock(JSON.stringify(good));
    await generate(c, eng, 0, ["Old stem one"]);
    const sent = (c.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0].messages[0].content;
    expect(sent).toContain("- Old stem one");
  });

  it("parseArg returns undefined for a missing flag, the value otherwise", () => {
    expect(parseArg(["node", "run.ts"], "n")).toBeUndefined();
    expect(parseArg(["node", "run.ts", "--skill", "abc"], "skill")).toBe("abc");
  });

  it("difficulty sweeps -2..2 and a single question is mid-range", () => {
    expect([difficultyAt(0, 5), difficultyAt(4, 5)]).toEqual([-2, 2]);
    expect(difficultyAt(0, 1)).toBe(0);
  });

  it("verifier gets no key", async () => {
    const c = mock("B");
    await verifyEnglish(c, good as never);
    const sent = (c.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0].messages[0].content;
    expect(sent).not.toContain("because");
  });
});
