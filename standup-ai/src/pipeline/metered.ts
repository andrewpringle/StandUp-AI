import type { Claude } from "./generate";

// Haiku 5.5 list price per token ($0.10 / $0.50 per MTok, prompts up to 100K). Update if MODEL changes.
const USD_IN = 0.1 / 1e6;
const USD_OUT = 0.5 / 1e6;

export class SpendCapError extends Error {}

// Wraps a Claude client: totals token cost and refuses new calls once `maxUsd` is reached.
// shortcut: the cap is checked before each call, so the last call can overshoot by one call's cost
// (well under a cent on Haiku); tighten by pre-counting tokens if that ever matters.
export function metered(inner: Claude, maxUsd: number) {
  const stats = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
  const client: Claude = {
    messages: {
      async create(a) {
        if (stats.usd >= maxUsd) {
          throw new SpendCapError(`spend cap $${maxUsd} reached ($${stats.usd.toFixed(4)} spent over ${stats.calls} calls)`);
        }
        const r = await inner.messages.create(a);
        stats.calls++;
        stats.inputTokens += r.usage?.input_tokens ?? 0;
        stats.outputTokens += r.usage?.output_tokens ?? 0;
        stats.usd = stats.inputTokens * USD_IN + stats.outputTokens * USD_OUT;
        return r;
      },
    },
  };
  return Object.assign(client, { stats: () => ({ ...stats }) });
}
