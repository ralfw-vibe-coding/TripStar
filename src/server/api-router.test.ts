import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStateProvider } from "../domain/providers/local/local-state-provider";
import { setStateProviderForTests } from "../domain/provider-factory";
import { handleApiRequest } from "./api-router";
import type { AuthSession, Booking, Trip, User } from "../domain/model";

const now = "2026-05-26T09:00:00.000Z";

// Shared test user with a known auth token so tests can call authenticated endpoints
const testUser: User = {
  id: "user_ralf",
  email: "ralf@example.com",
  shortCode: "RAF",
  name: null,
  companyName: null,
  jobPosition: null,
  signatureEmployee: null,
  signatureManager: null,
  createdAt: now,
  updatedAt: now,
};
const testSession: AuthSession = {
  token: "test-token",
  userId: "user_ralf",
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: now,
  revokedAt: null,
};
const authHeader = { authorization: "Bearer test-token" };

const trip: Trip = {
  id: "trip_200",
  tripNumber: "200",
  title: "Test Trip",
  ownerUserId: "user_ralf",
  startDate: "2026-07-01",
  endDate: "2026-07-02",
  places: "Test",
  purpose: null,
  meansOfTransportation: null,
  orderedAt: null,
  sharedWithUserIds: [],
  color: "",
  dailyAllowances: [],
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
};
const booking: Booking = {
  id: "booking_1",
  tripId: null,
  sourceDocumentId: null,
  type: "lodging",
  title: "Hotel",
  startAt: "2026-07-01T10:00:00.000Z",
  endAt: null,
  timePoints: [],
  fromText: null,
  toText: null,
  travelers: [],
  participantUserIds: ["user_ralf"], // visible in calendar as inbox booking
  status: "inbox",
  serviceIdentifier: null,
  operator: null,
  details: "",
  extractedJson: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

describe("API router", () => {
  beforeEach(() => {
    vi.stubEnv("TRIPSTAR_AUTH_MODE", "local");
    vi.stubEnv("TRIPSTAR_FILE_STORAGE", "local");
    setStateProviderForTests(
      new LocalStateProvider({
        now: () => new Date(now),
        users: [testUser],
        authSessions: [testSession],
        trips: [trip],
        bookings: [booking],
      }),
    );
  });

  it("returns the calendar view", async () => {
    const response = await handleApiRequest(
      new Request("http://localhost/api/calendar", { headers: authHeader }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bookings.length).toBe(1);
  });

  it("supports local OTP login and current user lookup", async () => {
    const otpResponse = await handleApiRequest(
      new Request("http://localhost/api/auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ralf@example.com" }),
      }),
    );
    const otpBody = await otpResponse.json();
    const verifyResponse = await handleApiRequest(
      new Request("http://localhost/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ralf@example.com", otp: otpBody.devOtp }),
      }),
    );
    const verifyBody = await verifyResponse.json();
    const meResponse = await handleApiRequest(
      new Request("http://localhost/api/auth/me", {
        headers: { authorization: `Bearer ${verifyBody.session.token}` },
      }),
    );

    expect(otpResponse.status).toBe(200);
    expect(verifyResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toMatchObject({ user: { email: "ralf@example.com" } });
  });

  it("updates the current user's profile", async () => {
    const otpResponse = await handleApiRequest(
      new Request("http://localhost/api/auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "profile@example.com" }),
      }),
    );
    const otpBody = await otpResponse.json();
    const verifyResponse = await handleApiRequest(
      new Request("http://localhost/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "profile@example.com", otp: otpBody.devOtp }),
      }),
    );
    const verifyBody = await verifyResponse.json();
    const profileResponse = await handleApiRequest(
      new Request("http://localhost/api/auth/profile", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${verifyBody.session.token}`,
        },
        body: JSON.stringify({ shortCode: "pf" }),
      }),
    );

    expect(profileResponse.status).toBe(200);
    await expect(profileResponse.json()).resolves.toMatchObject({ user: { shortCode: "PF" } });
  });

  it("creates trips through POST /api/trips", async () => {
    const response = await handleApiRequest(
      new Request("http://localhost/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Amsterdam",
          ownerUserId: "user_ralf",
          startDate: "2026-09-01",
          endDate: "2026-09-04",
          places: "Amsterdam",
          sharedWithUserIds: [],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ tripNumber: "201", title: "Amsterdam" });
  });

  it("assigns booking trip through PATCH /api/bookings/:id/trip", async () => {
    const response = await handleApiRequest(
      new Request("http://localhost/api/bookings/booking_1/trip", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId: "trip_200" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tripId).toBe("trip_200");
  });

  it("updates trips and bookings", async () => {
    const tripResponse = await handleApiRequest(
      new Request("http://localhost/api/trips/trip_200", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Trip Updated" }),
      }),
    );
    const bookingResponse = await handleApiRequest(
      new Request("http://localhost/api/bookings/booking_1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Hotel Updated" }),
      }),
    );

    await expect(tripResponse.json()).resolves.toMatchObject({ title: "Trip Updated" });
    await expect(bookingResponse.json()).resolves.toMatchObject({ title: "Hotel Updated" });
  });

  it("deletes bookings through DELETE /api/bookings/:id", async () => {
    const response = await handleApiRequest(
      new Request("http://localhost/api/bookings/booking_1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ booking: { id: "booking_1" }, deletedDocumentId: null });
  });

  it("returns activity log and rejects non-json command bodies", async () => {
    const activityResponse = await handleApiRequest(
      new Request("http://localhost/api/activity-log", { headers: authHeader }),
    );
    const badResponse = await handleApiRequest(
      new Request("http://localhost/api/trips", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(activityResponse.status).toBe(200);
    expect(badResponse.status).toBe(415);
  });

  it("reports missing routes as 404", async () => {
    const response = await handleApiRequest(new Request("http://localhost/api/missing"));

    expect(response.status).toBe(404);
  });

  it("uploads a trip document via POST /api/documents/trip-upload", async () => {
    // Uses real OpenAI + local storage — needs a generous timeout
    // A tiny 1x1 white PNG as base64
    const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==";
    const response = await handleApiRequest(
      new Request("http://localhost/api/documents/trip-upload", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader },
        body: JSON.stringify({
          base64: base64Png,
          originalFileName: "test.png",
          mimeType: "image/png",
          tripId: "trip_200",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      tripId: "trip_200",
      originalFileName: "test.png",
      mimeType: "image/png",
      sourceType: "upload",
      processingStatus: "ready",
      isReceipt: false,
    });
  }, 15000);
});
