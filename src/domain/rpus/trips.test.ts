import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import { archiveTrip, createTrip, listArchivedTrips, listTrips, suggestNextTripNumber, unarchiveTrip, updateTrip } from "./trips";
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

  it("archives and restores only trips owned by the user", async () => {
    const provider = new LocalStateProvider({ now: () => new Date(now), trips: [trip] });

    const archived = await archiveTrip(provider, "trip_200", "user_ralf");

    expect(archived.archivedAt).toBe(now);
    await expect(listTrips(provider)).resolves.toHaveLength(0);
    await expect(listArchivedTrips(provider, "user_ralf")).resolves.toMatchObject([{ id: "trip_200" }]);
    await expect(unarchiveTrip(provider, "trip_200", "other_user")).rejects.toThrow("Trip not found");

    const restored = await unarchiveTrip(provider, "trip_200", "user_ralf");

    expect(restored.archivedAt).toBeNull();
    await expect(listTrips(provider)).resolves.toHaveLength(1);
  });

  it("suggests the next trip number across all trips company-wide, not just the current user's", async () => {
    const provider = new LocalStateProvider({
      trips: [
        { ...trip, id: "trip_200", tripNumber: "200", ownerUserId: "user_ralf", sharedWithUserIds: [] },
        { ...trip, id: "trip_305", tripNumber: "305", ownerUserId: "user_someone_else", sharedWithUserIds: [] },
      ],
    });

    await expect(suggestNextTripNumber(provider)).resolves.toBe("306");
  });

  it("still counts archived trips owned by other users when suggesting the next number", async () => {
    const provider = new LocalStateProvider({
      now: () => new Date(now),
      trips: [{ ...trip, id: "trip_400", tripNumber: "400", ownerUserId: "user_someone_else", sharedWithUserIds: [] }],
    });
    await archiveTrip(provider, "trip_400", "user_someone_else");

    await expect(suggestNextTripNumber(provider)).resolves.toBe("401");
  });

  it("suggests 001 when no trips exist anywhere — 0 is the current max of an empty system", async () => {
    const provider = new LocalStateProvider({ trips: [] });

    await expect(suggestNextTripNumber(provider)).resolves.toBe("001");
  });

  it("auto-generates the trip number when createTrip is called without one", async () => {
    const provider = new LocalStateProvider({
      trips: [{ ...trip, id: "trip_200", tripNumber: "200", sharedWithUserIds: [] }],
    });

    const created = await createTrip(provider, {
      title: "Amsterdam",
      ownerUserId: "user_ralf",
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      places: "Amsterdam",
      sharedWithUserIds: [],
    });

    expect(created.tripNumber).toBe("201");
  });

  it("keeps auto-generated trip numbers increasing across persisted provider instances — this is where that guarantee now lives, not in the provider", async () => {
    const stateFilePath = join(mkdtempSync(join(tmpdir(), "tripstar-state-")), "local-state.json");

    const firstProvider = new LocalStateProvider({ trips: [], stateFilePath });
    const firstTrip = await createTrip(firstProvider, {
      title: "Alpha",
      ownerUserId: "user_ralf",
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      places: "Alpha",
      sharedWithUserIds: [],
    });

    const secondProvider = new LocalStateProvider({ stateFilePath });
    const secondTrip = await createTrip(secondProvider, {
      title: "Beta",
      ownerUserId: "user_ralf",
      startDate: "2026-07-03",
      endDate: "2026-07-04",
      places: "Beta",
      sharedWithUserIds: [],
    });

    expect(firstTrip.tripNumber).toBe("001");
    expect(secondTrip.tripNumber).toBe("002");
  });
});
