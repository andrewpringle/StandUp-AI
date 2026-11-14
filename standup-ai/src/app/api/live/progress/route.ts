import * as server from "../../../../server";
import { live } from "../_lib";

export const GET = live(() => server.getProgress(), "GET");
