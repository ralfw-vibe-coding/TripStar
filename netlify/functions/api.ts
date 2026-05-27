import type { Config, Context } from "@netlify/functions";
import { handleApiRequest } from "../../src/server/api-router";

export default async (request: Request, _context: Context) => {
  return handleApiRequest(request);
};

export const config: Config = {
  path: "/api/*",
};
