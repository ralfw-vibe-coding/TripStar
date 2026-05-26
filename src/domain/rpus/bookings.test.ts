import { describe, expect, it } from "vitest";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import { assignBookingToTrip, updateBooking } from "./bookings";
import type { Booking, Trip } from "../model";

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
  participantUserIds: [],
  status: "inbox",
  serviceIdentifier: null,
  operator: null,
  details: "",
  extractedJson: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

describe("booking RPUs", () => {
  it("validates title updates", async () => {
    const provider = new LocalStateProvider({ bookings: [booking] });

    await expect(updateBooking(provider, "booking_1", { title: "" })).rejects.toThrow("title");
  });

  it("assigns a booking to a trip", async () => {
    const provider = new LocalStateProvider({ trips: [trip], bookings: [booking] });
    const assignedBooking = await assignBookingToTrip(provider, "booking_1", "trip_200");

    expect(assignedBooking.tripId).toBe("trip_200");
  });
});
