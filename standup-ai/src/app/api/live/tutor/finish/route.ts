import * as server from "../../../../../server";
import { live } from "../../_lib";

export const POST = live(({ body: b }) => server.finishTutor({ sessionId: b.sessionId as string, questionId: b.questionId as string }));
