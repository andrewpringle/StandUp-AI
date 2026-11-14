import Anthropic from "@anthropic-ai/sdk";
import type { Claude } from "../pipeline/generate";
import { metered, SpendCapError } from "../pipeline/metered";
import { AppError } from "./contracts";

// Cached on globalThis so Next dev HMR doesn't reset the spend counter.
// shortcut: the cap is per server process; serverless cold starts reset it. Move spend to the DB before a public deploy.
const g = globalThis as typeof globalThis & { __standupClaude?: Claude };

export function getClaude(): Claude {
  if (g.__standupClaude) return g.__standupClaude;
  if (!process.env.ANTHROPIC_API_KEY) throw new AppError("NO_KEY", "The AI tutor isn't set up yet (no API key configured).");
  const cap = Number(process.env.MAX_USD || 1);
  // 30s timeout and one retry: this serves interactive requests, so fail fast instead of the SDK's 10-minute default.
  g.__standupClaude = metered(new Anthropic({ timeout: 30_000, maxRetries: 1 }) as unknown as Claude, Number.isFinite(cap) ? cap : 1);
  return g.__standupClaude;
}

export const setClaudeForTests = (c: Claude | null) => { g.__standupClaude = c ?? undefined; };

// Runs a model call and maps every failure to an AppError with a safe message (no internals, no stack).
export async function modelCall<T>(fn: (c: Claude) => Promise<T>): Promise<T> {
  try {
    return await fn(getClaude());
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof SpendCapError) throw new AppError("SPEND_CAP", "The demo's AI budget has been used up. Ask the host to raise the limit.");
    console.error("model call failed:", e instanceof Error ? e.message : e);
    throw new AppError("MODEL", "The tutor is unavailable right now. Please try again.");
  }
}
