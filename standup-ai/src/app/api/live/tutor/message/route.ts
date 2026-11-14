import * as server from "../../../../../server";
import { live } from "../../_lib";

export const POST = live(({ body: b }) => server.tutorMessage({
  sessionId: b.sessionId as string | undefined,
  questionId: b.questionId as string,
  message: b.message as string,
}));
