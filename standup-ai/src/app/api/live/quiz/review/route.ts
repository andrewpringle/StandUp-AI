import * as server from "../../../../../server";
import { live } from "../../_lib";

export const POST = live(({ body: b }) => server.reviewWork({ questionId: b.questionId as string, work: b.work as string }));
