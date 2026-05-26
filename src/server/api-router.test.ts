import { beforeEach, describe, expect, it } from "vitest";
import { LocalStateProvider } from "../domain/providers/local/local-state-provider";
import { setStateProviderForTests } from "../domain/provider-factory";
import { handleApiRequest } from "./api-router";
import type { Booking, Trip } from "../domain/model";

const now = "2026-05-26T09:00:00.000Z";
const trip: Trip = {
  id: "trip_200",
  tripNumber: "200",
  shortCode: "TST",
  title: "Test Trip",
  ownerUserId: "user_ralf",
  startDate: "2026-07-01",
  endDate: "2026-07-02",
  places: "Test",
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
  fromText: null,
  toText: null,
  travelers: [],
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
    setStateProviderForTests(
      new LocalStateProvider({
        now: () => new Date(now),
        trips: [trip],
        bookings: [booking],
      }),
    );
  });

  it("returns the calendar view", async () => {
    const response = await handleApiRequest(new Request("http://localhost/api/calendar"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bookings.length).toBe(1);
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
    expect(body.shortCode).toBe("AMSTE");
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

  it("returns activity log and rejects non-json command bodies", async () => {
    const activityResponse = await handleApiRequest(new Request("http://localhost/api/activity-log"));
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
});
