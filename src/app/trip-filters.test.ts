import { describe, expect, it } from "vitest";
import type { Trip } from "../domain/model";
import { ownTripsForUser, sharedTripsForUser } from "./trip-filters";

const baseTrip: Trip = {
  id: "trip_1",
  tripNumber: "001",
  title: "One",
  ownerUserId: "user_a",
  startDate: "2026-01-01",
  endDate: "2026-01-02",
  places: "One",
  purpose: null,
  meansOfTransportation: null,
  orderedAt: null,
  sharedWithUserIds: [],
  color: "",
  dailyAllowances: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
};

describe("trip filters", () => {
  it("shows only explicitly shared trips under shared", () => {
    const trips: Trip[] = [
      { ...baseTrip, id: "own", ownerUserId: "user_a", sharedWithUserIds: ["user_b"] },
      { ...baseTrip, id: "other-not-shared", ownerUserId: "user_b", sharedWithUserIds: [] },
      { ...baseTrip, id: "shared", ownerUserId: "user_b", sharedWithUserIds: ["user_a"] },
    ];

    expect(ownTripsForUser(trips, "user_a").map((trip) => trip.id)).toEqual(["own"]);
    expect(sharedTripsForUser(trips, "user_a").map((trip) => trip.id)).toEqual(["shared"]);
  });
});
