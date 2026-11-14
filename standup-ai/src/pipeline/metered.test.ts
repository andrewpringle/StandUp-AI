import { expect, it, vi } from "vitest";
import type { Claude } from "./generate";
import { metered, SpendCapError } from "./metered";

const inner = (): Claude => ({
  messages: {
    create: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "hi" }],
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 }, // $0.10 + $0.50 = $0.60 per call
    }),
  },
});
const args = { model: "m", max_tokens: 1, messages: [{ role: "user" as const, content: "x" }] };

it("totals Haiku cost per call and blocks once the cap is reached", async () => {
  const inside = inner();
  const c = metered(inside, 0.5);
  await c.messages.create(args);
  expect(c.stats()).toMatchObject({ calls: 1, inputTokens: 1_000_000, outputTokens: 1_000_000 });
  expect(c.stats().usd).toBeCloseTo(0.6);
  await expect(c.messages.create(args)).rejects.toBeInstanceOf(SpendCapError);
  expect(inside.messages.create).toHaveBeenCalledTimes(1); // blocked call never reached the API
});

it("allows calls under the cap", async () => {
  const c = metered(inner(), 5);
  await c.messages.create(args);
  await c.messages.create(args);
  expect(c.stats().calls).toBe(2);
});
