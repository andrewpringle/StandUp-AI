import * as server from "../../../../server";
import { live } from "../_lib";

export const GET = live(async ({ request }) => ({
  items: await server.getReviewItems(new URL(request.url).searchParams.get("skillId") ?? undefined),
}), "GET");
