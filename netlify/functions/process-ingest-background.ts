import type { BackgroundHandler, HandlerEvent } from "@netlify/functions";
import { processIngestEmail } from "../../src/domain/reactors/ingest-email";
import { getStateProvider } from "../../src/domain/provider-factory";
import { createDocumentStorageProvider, createBookingAnalysisProvider } from "../../src/server/provider-factories";
import { withUserId } from "../../src/domain/providers/user-context";

/**
 * Netlify Background Function — runs for up to 15 minutes.
 * Triggered by the main API function once all ingest parts are received.
 * Netlify automatically returns 202 to the caller; this handler runs async.
 */
export const handler: BackgroundHandler = async (event: HandlerEvent) => {
  const token = (event.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token !== process.env.EMAIL_INGEST_TOKEN) {
    return;
  }

  const body = JSON.parse(event.body ?? "{}") as { txId?: string; sender?: string; userId?: string };
  const { txId, sender, userId } = body;
  if (!txId || !sender || !userId) return;

  await withUserId(userId, () =>
    processIngestEmail(
      getStateProvider(),
      createDocumentStorageProvider(),
      createBookingAnalysisProvider(),
      txId,
      sender,
      userId,
    ),
  );
};
