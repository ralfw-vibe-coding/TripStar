import { assignBookingToTrip, updateBooking } from "../domain/rpus/bookings";
import { getCurrentUser, requestLoginOtp, verifyLoginOtp } from "../domain/rpus/auth";
import { getCalendar } from "../domain/rpus/calendar";
import { createTrip, listTrips, updateTrip } from "../domain/rpus/trips";
import { getStateProvider } from "../domain/provider-factory";
import { LocalDocumentStorageProvider } from "../domain/providers/local/local-document-storage-provider";
import { OpenAIBookingAnalysisProvider } from "../domain/providers/openai/openai-booking-analysis-provider";
import type { CreateTripInput, UpdateBookingInput, UpdateTripInput } from "../domain/providers/state-provider";
import { submitImageDocument } from "../domain/reactors/submit-image-document";
import { submitTextDocument } from "../domain/reactors/submit-text-document";
import { errorResponse, HttpError, jsonResponse, readJson } from "./http";
import { loadLocalEnv } from "./local-env";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

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
        return jsonResponse(await requestLoginOtp(provider, body.email));
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
        await submitTextDocument(provider, createDocumentStorageProvider(), createBookingAnalysisProvider(), {
          text: body.text,
          tripId: body.tripId,
        }),
        { status: 201 },
      );
    }

    if (segments[0] === "documents" && segments.length === 2 && segments[1] === "image" && request.method === "POST") {
      const user = await getCurrentUser(provider, bearerToken(request));
      if (!user) {
        return jsonResponse({ error: "Authentication required." }, { status: 401 });
      }
      const body = await readJson<{ base64: string; mimeType: string; tripId: string | null }>(request);
      return jsonResponse(
        await submitImageDocument(provider, createDocumentStorageProvider(), createBookingAnalysisProvider(), {
          base64: body.base64,
          mimeType: body.mimeType,
          tripId: body.tripId,
        }),
        { status: 201 },
      );
    }

    if (request.method === "GET" && segments[0] === "activity-log" && segments.length === 1) {
      return jsonResponse(await provider.listActivity());
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

function createBookingAnalysisProvider(): OpenAIBookingAnalysisProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for booking analysis.");
  }
  return new OpenAIBookingAnalysisProvider(apiKey, process.env.OPENAI_MODEL ?? "gpt-5.4-mini");
}

function createDocumentStorageProvider(): LocalDocumentStorageProvider {
  const localPersistenceDir = process.env.LOCAL_PERSISTENCE_DIR ?? "./data";
  return new LocalDocumentStorageProvider(join(resolveLocalPersistenceDir(localPersistenceDir), "storage"));
}

function resolveLocalPersistenceDir(localPersistenceDir: string): string {
  if (isAbsolute(localPersistenceDir)) return localPersistenceDir;
  return resolve(projectRoot(), localPersistenceDir);
}

function projectRoot(): string {
  const candidates = [process.env.TRIPSTAR_PROJECT_ROOT, process.env.PWD, process.env.INIT_CWD, process.cwd()].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  return candidates.find((candidate) => existsSync(join(candidate, "package.json"))) ?? process.cwd();
}
