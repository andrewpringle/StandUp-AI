import { AppError, type ErrorCode } from "../../../server/contracts";

// Shared pipeline for every /api/live route: gate -> same-origin -> body -> run -> JSON.
// The static demo calls these with fetch; errors are always {error:{code,message}} with a safe message.
const STATUS: Record<ErrorCode, number> = { BAD_INPUT: 400, NOT_FOUND: 404, NO_KEY: 503, SPEND_CAP: 429, MODEL: 502 };
const MAX_BODY = 8000;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (status: number, code: ErrorCode, message: string) => json({ error: { code, message } }, status);

export type Ctx = { request: Request; body: Record<string, unknown> };

export function live(run: (c: Ctx) => Promise<unknown>, method: "GET" | "POST" = "POST") {
  return async (request: Request): Promise<Response> => {
    // Off by default so nothing reaches the DB or the model unless the demo host opts in.
    if (process.env.STANDUP_LIVE_BACKEND !== "true") return fail(503, "NO_KEY", "The live backend is not enabled.");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return fail(403, "BAD_INPUT", "Invalid origin.");

    let body: Record<string, unknown> = {};
    if (method === "POST") {
      const text = await request.text();
      if (text.length > MAX_BODY) return fail(413, "BAD_INPUT", "Request is too large.");
      try {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        body = parsed as Record<string, unknown>;
      } catch {
        return fail(400, "BAD_INPUT", "A JSON object body is required.");
      }
    }

    try {
      return json(await run({ request, body }));
    } catch (e) {
      if (e instanceof AppError) return fail(STATUS[e.code], e.code, e.message);
      console.error("live api error:", e instanceof Error ? e.message : e);
      return fail(500, "MODEL", "Something went wrong.");
    }
  };
}
