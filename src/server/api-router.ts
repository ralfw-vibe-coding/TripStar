import { assignBookingToTrip, updateBooking } from "../domain/rpus/bookings";
import { getCurrentUser, requestLoginOtp, verifyLoginOtp } from "../domain/rpus/auth";
import { getCalendar } from "../domain/rpus/calendar";
import { createTrip, listTrips, updateTrip } from "../domain/rpus/trips";
import { getStateProvider } from "../domain/provider-factory";
import type { CreateTripInput, UpdateBookingInput, UpdateTripInput } from "../domain/providers/state-provider";
import { errorResponse, HttpError, jsonResponse, readJson } from "./http";

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
