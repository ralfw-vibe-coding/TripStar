import { assignBookingToTrip, deleteBooking, updateBooking } from "../domain/rpus/bookings";
import { getCurrentUser, requestLoginOtp, verifyLoginOtp } from "../domain/rpus/auth";
import { getCalendar } from "../domain/rpus/calendar";
import { createTrip, listTrips, updateTrip } from "../domain/rpus/trips";
import { getStateProvider } from "../domain/provider-factory";
import type { CreateTripInput, UpdateBookingInput, UpdateTripInput } from "../domain/providers/state-provider";
import type { IngestPart } from "../domain/model";
import { submitAnalysisJob } from "../domain/reactors/analysis-jobs";
import { receiveIngestPart, queueIngestProcessing } from "../domain/reactors/ingest-email";
import { sendOtpEmail } from "./email";
import { errorResponse, HttpError, jsonResponse, readJson } from "./http";
import { loadLocalEnv } from "./local-env";
import { createBookingAnalysisProvider, createDocumentStorageProvider } from "./provider-factories";

loadLocalEnv();

export async function handleApiRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, "");
    const segments = path.split("/").filter(Boolean);
    const provider = getStateProvider();

    if (segments[0] === "auth") {
      if (request.method === "POST" && segments.length === 2 && segments[1] === "request-otp") {
        const body = await readJson<{ email: string }>(request);
        const result = await requestLoginOtp(provider, body.email);
        if (process.env.TRIPSTAR_AUTH_MODE === "email") {
          if (!result.devOtp) {
            throw new Error("OTP generation failed.");
          }
          await sendOtpEmail({ to: result.email, otp: result.devOtp, expiresAt: result.expiresAt });
          return jsonResponse({ email: result.email, expiresAt: result.expiresAt });
        }
        return jsonResponse(result);
      }

      if (request.method === "POST" && segments.length === 2 && segments[1] === "verify-otp") {
        const body = await readJson<{ email: string; otp: string }>(request);
        return jsonResponse(await verifyLoginOtp(provider, body.email, body.otp));
      }

      if (request.method === "GET" && segments.length === 2 && segments[1] === "me") {
        const user = await getCurrentUser(provider, bearerToken(request));
        return user ? jsonResponse({ user }) : jsonResponse({ user: null }, { status: 401 });
      }

      if (request.method === "PATCH" && segments.length === 2 && segments[1] === "profile") {
        const user = await getCurrentUser(provider, bearerToken(request));
        if (!user) {
          return jsonResponse({ error: "Authentication required." }, { status: 401 });
        }
        return jsonResponse({
          user: await provider.updateUserProfile(user.id, await readJson<{ shortCode: string }>(request)),
        });
      }

      if (request.method === "POST" && segments.length === 2 && segments[1] === "logout") {
        const token = bearerToken(request);
        if (token) {
          await provider.revokeAuthSession(token);
        }
        return jsonResponse({ ok: true });
      }
    }

    if (request.method === "GET" && segments[0] === "calendar" && segments.length === 1) {
      return jsonResponse(await getCalendar(provider));
    }

    if (segments[0] === "trips") {
      if (request.method === "GET" && segments.length === 1) {
        return jsonResponse(await listTrips(provider));
      }

      if (request.method === "POST" && segments.length === 1) {
        return jsonResponse(await createTrip(provider, await readJson<CreateTripInput>(request)), { status: 201 });
      }

      if (request.method === "PATCH" && segments.length === 2) {
        return jsonResponse(await updateTrip(provider, segments[1], await readJson<UpdateTripInput>(request)));
      }
    }

    if (segments[0] === "bookings" && segments.length >= 2) {
      if (request.method === "DELETE" && segments.length === 2) {
        return jsonResponse(await deleteBooking(provider, segments[1]));
      }

      if (request.method === "PATCH" && segments.length === 2) {
        return jsonResponse(await updateBooking(provider, segments[1], await readJson<UpdateBookingInput>(request)));
      }

      if (request.method === "PATCH" && segments.length === 3 && segments[2] === "trip") {
        const body = await readJson<{ tripId: string | null }>(request);
        return jsonResponse(await assignBookingToTrip(provider, segments[1], body.tripId));
      }
    }

    if (segments[0] === "documents" && segments.length === 2 && segments[1] === "text" && request.method === "POST") {
      const user = await getCurrentUser(provider, bearerToken(request));
      if (!user) {
        return jsonResponse({ error: "Authentication required." }, { status: 401 });
      }
      const body = await readJson<{ text: string; tripId: string | null }>(request);
      return jsonResponse(
        await submitAnalysisJob(provider, createDocumentStorageProvider(), createBookingAnalysisProvider(), {
          sourceType: "text",
          text: body.text,
          tripId: body.tripId,
          currentUserId: user.id,
        }),
        { status: 202 },
      );
    }

    if (segments[0] === "documents" && segments.length === 3 && segments[2] === "original" && request.method === "GET") {
      const user = await getCurrentUser(provider, bearerToken(request));
      if (!user) {
        return jsonResponse({ error: "Authentication required." }, { status: 401 });
      }
      const document = (await provider.listDocuments()).find((candidate) => candidate.id === segments[1]);
      if (!document) {
        return jsonResponse({ error: "Document not found." }, { status: 404 });
      }
      const stored = document.storageKey ? await createDocumentStorageProvider().readDocument(document.storageKey) : { base64: null };
      return jsonResponse({
        id: document.id,
        originalFileName: document.originalFileName,
        mimeType: document.mimeType,
        sourceType: document.sourceType,
        base64: stored.base64,
        text: document.extractedText,
      });
    }

    if (segments[0] === "documents" && segments.length === 2 && segments[1] === "image" && request.method === "POST") {
      const user = await getCurrentUser(provider, bearerToken(request));
      if (!user) {
        return jsonResponse({ error: "Authentication required." }, { status: 401 });
      }
      const body = await readJson<{ base64: string; mimeType: string; tripId: string | null }>(request);
      return jsonResponse(
        await submitAnalysisJob(provider, createDocumentStorageProvider(), createBookingAnalysisProvider(), {
          sourceType: "screenshot",
          base64: body.base64,
          mimeType: body.mimeType,
          tripId: body.tripId,
          currentUserId: user.id,
        }),
        { status: 202 },
      );
    }

    if (segments[0] === "documents" && segments.length === 2 && segments[1] === "pdf" && request.method === "POST") {
      const user = await getCurrentUser(provider, bearerToken(request));
      if (!user) {
        return jsonResponse({ error: "Authentication required." }, { status: 401 });
      }
      const body = await readJson<{ documents: Array<{ base64: string; originalFileName: string }>; tripId: string | null }>(request);
      if (body.documents.length === 0) {
        throw new Error("At least one PDF document is required.");
      }
      const storage = createDocumentStorageProvider();
      const analyzer = createBookingAnalysisProvider();
      const jobs = await Promise.all(
        body.documents.map((document) =>
          submitAnalysisJob(provider, storage, analyzer, {
            sourceType: "pdf",
            documents: [document],
            documentName: document.originalFileName,
            tripId: body.tripId,
            currentUserId: user.id,
          }).then((result) => result.job),
        ),
      );
      return jsonResponse({ jobs }, { status: 202 });
    }

    if (request.method === "GET" && segments[0] === "analysis-jobs" && segments.length === 1) {
      const user = await getCurrentUser(provider, bearerToken(request));
      if (!user) {
        return jsonResponse({ error: "Authentication required." }, { status: 401 });
      }
      return jsonResponse((await provider.listAnalysisJobs()).filter((job) => job.currentUserId === user.id));
    }

    if (request.method === "GET" && segments[0] === "activity-log" && segments.length === 1) {
      return jsonResponse(await provider.listActivity());
    }

    if (request.method === "POST" && segments[0] === "ingest-email" && segments.length === 1) {
      const token = bearerToken(request);
      const expectedToken = process.env.EMAIL_INGEST_TOKEN;
      if (!expectedToken) {
        await provider.appendActivity({
          level: "error",
          scope: "inbox",
          message: "[Inbox] EMAIL_INGEST_TOKEN not configured — request rejected",
          documentName: null,
          details: null,
        });
        return jsonResponse({ error: "Unauthorized." }, { status: 401 });
      }
      if (!token || token !== expectedToken) {
        await provider.appendActivity({
          level: "warn",
          scope: "inbox",
          message: "[Inbox] Request rejected: invalid or missing token",
          documentName: null,
          details: null,
        });
        return jsonResponse({ error: "Unauthorized." }, { status: 401 });
      }
      const part = await readJson<IngestPart>(request);
      const received = await receiveIngestPart(provider, part);
      if (received.status === "unknown_sender") {
        return jsonResponse({ error: `Unknown sender: ${part.sender}` }, { status: 403 });
      }
      if (received.status === "ready_to_process") {
        await triggerIngestProcessing(provider, part.txId, part.sender, received.userId, expectedToken);
      }
      return jsonResponse({ status: received.status }, { status: 202 });
    }

    throw new HttpError(404, `No API route for ${request.method} ${url.pathname}`);
  } catch (error) {
    return errorResponse(error);
  }
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

/**
 * On Netlify (process.env.URL is set): POST to the Background Function which
 * has a 15-minute timeout — enough for any PDF + OpenAI round-trip.
 * Locally (no URL env var): fall back to setTimeout so the work runs after
 * the response without blocking it.
 */
async function triggerIngestProcessing(
  state: ReturnType<typeof getStateProvider>,
  txId: string,
  sender: string,
  userId: string,
  ingestToken: string,
): Promise<void> {
  const siteUrl = process.env.URL;
  if (siteUrl) {
    try {
      await fetch(`${siteUrl}/.netlify/functions/process-ingest-background`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ingestToken}`,
        },
        body: JSON.stringify({ txId, sender, userId }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await state.appendActivity({
        level: "error",
        scope: "inbox",
        message: `[Inbox] Failed to trigger background processing for ${txId}: ${msg}`,
        documentName: null,
        details: { txId },
      });
    }
  } else {
    queueIngestProcessing(
      state,
      createDocumentStorageProvider(),
      createBookingAnalysisProvider(),
      txId,
      sender,
      userId,
    );
  }
}
