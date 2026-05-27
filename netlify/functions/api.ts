import type { Config, Context } from "@netlify/functions";
import { handleApiRequest } from "../../src/server/api-router";

export default async (request: Request, context: Context) => {
  return handleApiRequest(request, (p: Promise<void>) => context.waitUntil(p));
};

export const config: Config = {
  path: "/api/*",
};
