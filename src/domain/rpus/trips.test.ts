import { describe, expect, it } from "vitest";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import { createTrip, listTrips, updateTrip } from "./trips";
import type { Trip } from "../model";

const now = "2026-05-26T09:00:00.000Z";
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

describe("trip RPUs", () => {
  it("rejects trips whose end date is before the start date", async () => {
    const provider = new LocalStateProvider();

    await expect(
      createTrip(provider, {
        title: "Bad dates",
        ownerUserId: "user_ralf",
        startDate: "2026-08-10",
        endDate: "2026-08-09",
        places: "Nowhere",
        sharedWithUserIds: [],
      }),
    ).rejects.toThrow("end date");
  });

  it("updates trips through the provider", async () => {
    const provider = new LocalStateProvider({ trips: [trip] });
    const updated = await updateTrip(provider, "trip_200", { title: "Updated Trip" });

    expect(updated.title).toBe("Updated Trip");
  });

  it("lists trips and validates full date updates", async () => {
    const provider = new LocalStateProvider({ trips: [trip] });

    await expect(listTrips(provider)).resolves.toHaveLength(1);
    await expect(
      updateTrip(provider, "trip_200", {
        startDate: "2026-08-10",
        endDate: "2026-08-09",
      }),
    ).rejects.toThrow("end date");
  });
});
