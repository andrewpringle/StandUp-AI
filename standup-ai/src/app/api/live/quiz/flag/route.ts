import * as server from "../../../../../server";
import { live } from "../../_lib";

export const POST = live(({ body: b }) => server.toggleFlag({ questionId: b.questionId as string, flagged: b.flagged as boolean }));
