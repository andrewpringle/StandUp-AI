import * as server from "../../../../../server";
import { live } from "../../_lib";

export const POST = live(({ body }) => server.nextQuestion(body.sessionId as string | undefined));
