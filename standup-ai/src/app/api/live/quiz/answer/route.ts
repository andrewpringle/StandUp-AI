import * as server from "../../../../../server";
import { live } from "../../_lib";

// The server layer validates every field; timeMs is forwarded only when the client sent it.
export const POST = live(({ body: b }) => server.submitAnswer({
  sessionId: b.sessionId as string,
  questionId: b.questionId as string,
  chosen: b.chosen as number,
  clientAttemptId: b.clientAttemptId as string,
  ...(b.timeMs !== undefined && { timeMs: b.timeMs as number }),
}));
