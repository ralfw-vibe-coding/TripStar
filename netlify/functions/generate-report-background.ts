import type { BackgroundHandler, HandlerEvent } from "@netlify/functions";
import { getStateProvider } from "../../src/domain/provider-factory";
import { createDocumentStorageProvider } from "../../src/server/provider-factories";
import { generateTripReport } from "../../src/domain/reactors/generate-trip-report";
import { withUserId } from "../../src/domain/providers/user-context";
import { loadLocalEnv } from "../../src/server/local-env";

loadLocalEnv();

/**
 * Netlify Background Function — generates a trip report ZIP and emails a download link.
 * Netlify automatically returns 202 to the caller; this handler runs async.
 */
export const handler: BackgroundHandler = async (event: HandlerEvent) => {
  const token = (event.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token !== process.env.REPORT_TOKEN) {
    return;
  }

  const body = JSON.parse(event.body ?? "{}") as { tripId?: string; userId?: string; siteUrl?: string };
  const { tripId, userId, siteUrl } = body;
  if (!tripId || !userId || !siteUrl) return;

  await withUserId(userId, () =>
    generateTripReport(
      getStateProvider(),
      createDocumentStorageProvider(),
      { tripId, userId, siteUrl },
    ),
  );
};
