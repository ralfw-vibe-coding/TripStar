import { beforeEach, describe, expect, it } from "vitest";
import { LocalStateProvider } from "./local-state-provider";
import { resetIdsForTests } from "./id";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { Booking, Trip } from "../../model";

const fixedNow = new Date("2026-05-26T09:00:00.000Z");
const fixedIso = fixedNow.toISOString();

function testTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip_sfo",
    tripNumber: "200",
    title: "San Francisco Sprint",
    ownerUserId: "user_ralf",
    startDate: "2026-06-03",
    endDate: "2026-06-09",
    places: "San Francisco",
    sharedWithUserIds: [],
    color: "",
    dailyAllowances: [],
    createdAt: fixedIso,
    updatedAt: fixedIso,
    archivedAt: null,
    ...overrides,
  };
}

function testBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "booking_hotel_1",
    tripId: null,
    sourceDocumentId: null,
    type: "lodging",
    title: "Hotel reservation",
    startAt: "2026-06-03T22:00:00.000Z",
    endAt: "2026-06-09T09:00:00.000Z",
    fromText: "San Francisco",
    toText: null,
    travelers: ["RW"],
    participantUserIds: [],
    status: "inbox",
    serviceIdentifier: null,
    operator: "Hotel",
    details: "Test booking.",
    extractedJson: null,
    createdAt: fixedIso,
    updatedAt: fixedIso,
    deletedAt: null,
    ...overrides,
  };
}

describe("LocalStateProvider", () => {
  beforeEach(() => {
    resetIdsForTests();
  });

  it("creates trips and records activity", async () => {
    const provider = new LocalStateProvider({ now: () => fixedNow });

    const trip = await provider.createTrip({
      title: "Berlin Workshop",
      ownerUserId: "user_ralf",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      places: "Berlin",
      sharedWithUserIds: ["user_mara", "user_ralf"],
    });

    expect(trip).toMatchObject({
      tripNumber: "200",
      places: "Berlin",
      sharedWithUserIds: ["user_mara"],
      color: "",
    });
    await expect(provider.listActivity()).resolves.toHaveLength(1);
  });

  it("uses the generated trip number as title when no title is provided", async () => {
    const provider = new LocalStateProvider({ now: () => fixedNow });

    const trip = await provider.createTrip({
      title: "   ",
      ownerUserId: "user_ralf",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      places: "Berlin",
      sharedWithUserIds: [],
    });

    expect(trip.tripNumber).toBe("200");
    expect(trip.title).toBe("#200");
  });

  it("returns cloned state so callers cannot mutate provider internals", async () => {
    const provider = new LocalStateProvider({ now: () => fixedNow, trips: [testTrip()] });
    const trips = await provider.listTrips();
    trips[0].title = "Mutated outside";

    await expect(provider.listTrips()).resolves.not.toContainEqual(
      expect.objectContaining({ title: "Mutated outside" }),
    );
  });

  it("lists trips sorted by starting date", async () => {
    const provider = new LocalStateProvider({
      now: () => fixedNow,
      trips: [
        {
          id: "late",
          tripNumber: "202",
          title: "Late",
          ownerUserId: "user_ralf",
          startDate: "2026-12-01",
          endDate: "2026-12-03",
          places: "Late City",
          sharedWithUserIds: [],
          color: "#0f766e",
          dailyAllowances: [],
          createdAt: fixedIso,
          updatedAt: fixedIso,
          archivedAt: null,
        },
        {
          id: "early",
          tripNumber: "201",
          title: "Early",
          ownerUserId: "user_ralf",
          startDate: "2026-01-01",
          endDate: "2026-01-03",
          places: "Early City",
          sharedWithUserIds: [],
          color: "#b45309",
          dailyAllowances: [],
          createdAt: fixedIso,
          updatedAt: fixedIso,
          archivedAt: null,
        },
      ],
    });

    const trips = await provider.listTrips();
    expect(trips.map((trip) => trip.id)).toEqual(["early", "late"]);
  });

  it("normalizes persisted trip ids and drops duplicate trip numbers", async () => {
    const provider = new LocalStateProvider({
      now: () => fixedNow,
      trips: [
        {
          id: "old_1",
          tripNumber: "201",
          title: "Old duplicate",
          ownerUserId: "user_ralf",
          startDate: "2026-07-01",
          endDate: "2026-07-02",
          places: "Old",
          sharedWithUserIds: [],
          color: "",
          dailyAllowances: [],
          createdAt: fixedIso,
          updatedAt: fixedIso,
          archivedAt: null,
        },
        {
          id: "old_2",
          tripNumber: "201",
          title: "Kept duplicate",
          ownerUserId: "user_ralf",
          startDate: "2026-07-03",
          endDate: "2026-07-04",
          places: "New",
          sharedWithUserIds: [],
          color: "",
          dailyAllowances: [],
          createdAt: fixedIso,
          updatedAt: fixedIso,
          archivedAt: null,
        },
      ],
    });

    const trips = await provider.listTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ id: "trip_201", title: "Kept duplicate" });
  });

  it("keeps trip numbers increasing across persisted local provider instances", async () => {
    const stateFilePath = join(mkdtempSync(join(tmpdir(), "tripstar-state-")), "local-state.json");
    const firstProvider = new LocalStateProvider({ now: () => fixedNow, stateFilePath });
    const firstTrip = await firstProvider.createTrip({
      title: "Alpha",
      ownerUserId: "user_ralf",
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      places: "Alpha",
      sharedWithUserIds: [],
    });

    const secondProvider = new LocalStateProvider({ now: () => fixedNow, stateFilePath });
    const secondTrip = await secondProvider.createTrip({
      title: "Beta",
      ownerUserId: "user_ralf",
      startDate: "2026-07-03",
      endDate: "2026-07-04",
      places: "Beta",
      sharedWithUserIds: [],
    });

    expect(firstTrip.tripNumber).toBe("200");
    expect(secondTrip.tripNumber).toBe("201");
  });

  it("backs up local state before overwriting it", async () => {
    const stateFilePath = join(mkdtempSync(join(tmpdir(), "tripstar-state-")), "state", "tripstar-state.json");
    const provider = new LocalStateProvider({ now: () => fixedNow, stateFilePath });
    await provider.createTrip({
      title: "Alpha",
      ownerUserId: "user_ralf",
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      places: "Alpha",
      sharedWithUserIds: [],
    });
    await provider.createTrip({
      title: "Beta",
      ownerUserId: "user_ralf",
      startDate: "2026-07-03",
      endDate: "2026-07-04",
      places: "Beta",
      sharedWithUserIds: [],
    });

    const backupDir = join(dirname(dirname(stateFilePath)), "backups");
    expect(existsSync(backupDir)).toBe(true);
    expect(readdirSync(backupDir).some((file) => file.startsWith("tripstar-state."))).toBe(true);
  });

  it("uses configured initial trip number when no trips exist", async () => {
    const provider = new LocalStateProvider({
      now: () => fixedNow,
      trips: [],
      initialTripNumber: 98,
    });

    const trip = await provider.createTrip({
      title: "",
      ownerUserId: "user_ralf",
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      places: "Berlin",
      sharedWithUserIds: [],
    });

    expect(trip.tripNumber).toBe("098");
    expect(trip.title).toBe("#098");
  });

  it("creates users and sessions through local OTP auth", async () => {
    const provider = new LocalStateProvider({ now: () => fixedNow });

    const requested = await provider.requestLoginOtp("RALF@example.com");
    const verified = await provider.verifyLoginOtp("ralf@example.com", requested.devOtp ?? "");
    const session = await provider.getAuthSession(verified.session.token);

    expect(requested.email).toBe("ralf@example.com");
    expect(verified.user).toMatchObject({
      email: "ralf@example.com",
      shortCode: "RAL",
    });
    expect(verified.user).not.toHaveProperty("displayName");
    expect(session?.user.email).toBe("ralf@example.com");
  });

  it("updates a user's profile code", async () => {
    const provider = new LocalStateProvider({ now: () => fixedNow });
    const requested = await provider.requestLoginOtp("ralf@example.com");
    const verified = await provider.verifyLoginOtp("ralf@example.com", requested.devOtp ?? "");

    const user = await provider.updateUserProfile(verified.user.id, { shortCode: "rw" });

    expect(user.shortCode).toBe("RW");
  });

  it("rejects expired or invalid OTPs", async () => {
    const provider = new LocalStateProvider({
      now: () => new Date("2026-05-26T09:10:00.000Z"),
      otpChallenges: [
        {
          id: "otp_1",
          email: "ralf@example.com",
          otp: "123456",
          expiresAt: "2026-05-26T09:00:00.000Z",
          consumedAt: null,
          createdAt: "2026-05-26T08:55:00.000Z",
        },
      ],
    });

    await expect(provider.verifyLoginOtp("ralf@example.com", "123456")).rejects.toThrow("Invalid or expired OTP");
  });

  it("assigns bookings to trips and rejects missing trips", async () => {
    const provider = new LocalStateProvider({
      now: () => fixedNow,
      trips: [testTrip()],
      bookings: [testBooking()],
    });

    const assigned = await provider.assignBookingToTrip("booking_hotel_1", "trip_sfo");
    expect(assigned.tripId).toBe("trip_sfo");

    await expect(provider.assignBookingToTrip("booking_hotel_1", "missing")).rejects.toThrow("Trip not found");
  });

  it("normalizes persisted bookings from before participant assignment existed", async () => {
    const provider = new LocalStateProvider({
      now: () => fixedNow,
      bookings: [{ ...testBooking(), participantUserIds: undefined as unknown as string[] }],
    });

    await expect(provider.listBookings()).resolves.toMatchObject([{ participantUserIds: [] }]);
  });

  it("keeps past bookings in the calendar view so UI filters can decide visibility", async () => {
    const provider = new LocalStateProvider({
      now: () => fixedNow,
      trips: [testTrip()],
      bookings: [
        {
          id: "past",
          tripId: "trip_sfo",
          sourceDocumentId: null,
          type: "flight",
          title: "Past flight",
          startAt: "2026-05-20T10:00:00.000Z",
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
          createdAt: fixedIso,
          updatedAt: fixedIso,
          deletedAt: null,
        },
      ],
    });

    const calendar = await provider.getCalendarView(fixedNow);
    expect(calendar.bookings).toMatchObject([{ id: "past", tripId: "trip_sfo" }]);
  });

  it("updates trips, bookings, and document assignments", async () => {
    const provider = new LocalStateProvider({
      now: () => fixedNow,
      trips: [testTrip()],
      bookings: [testBooking()],
      documents: [
        {
          id: "document_1",
          tripId: null,
          storageKey: "local/document_1.pdf",
          originalFileName: "receipt.pdf",
          mimeType: "application/pdf",
          sourceType: "upload",
          sourceEmailIngestId: null,
          extractedText: null,
          isReceipt: false,
          receiptAmount: null,
          receiptCurrency: null,
          receiptJson: null,
          processingStatus: "ready",
          createdAt: fixedIso,
          updatedAt: fixedIso,
          deletedAt: null,
        },
      ],
    });

    await expect(provider.updateTrip("trip_sfo", { title: "Renamed" })).resolves.toMatchObject({ title: "Renamed" });
    await expect(provider.updateBooking("booking_hotel_1", { status: "reviewed" })).resolves.toMatchObject({
      status: "reviewed",
    });
    await expect(provider.assignDocumentToTrip("document_1", "trip_sfo")).resolves.toMatchObject({
      tripId: "trip_sfo",
    });
    await expect(provider.listDocuments()).resolves.toHaveLength(1);
  });

  it("soft-deletes bookings and documents", async () => {
    const provider = new LocalStateProvider({
      now: () => fixedNow,
      bookings: [testBooking({ sourceDocumentId: "document_1" })],
      documents: [
        {
          id: "document_1",
          tripId: null,
          storageKey: "local/document_1.pdf",
          originalFileName: "receipt.pdf",
          mimeType: "application/pdf",
          sourceType: "upload",
          sourceEmailIngestId: null,
          extractedText: null,
          isReceipt: false,
          receiptAmount: null,
          receiptCurrency: null,
          receiptJson: null,
          processingStatus: "ready",
          createdAt: fixedIso,
          updatedAt: fixedIso,
          deletedAt: null,
        },
      ],
    });

    await expect(provider.deleteBooking("booking_hotel_1")).resolves.toMatchObject({ deletedAt: fixedIso });
    await expect(provider.listBookings()).resolves.toEqual([]);
    await expect(provider.deleteDocument("document_1")).resolves.toMatchObject({ deletedAt: fixedIso });
    await expect(provider.listDocuments()).resolves.toEqual([]);
    await expect(provider.listActivity()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "booking", message: "Deleted booking Hotel reservation" }),
        expect.objectContaining({ scope: "document", message: "Deleted document after last booking was removed" }),
      ]),
    );
  });

  it("rejects missing bookings and documents", async () => {
    const provider = new LocalStateProvider({ now: () => fixedNow });

    await expect(provider.updateBooking("missing", { title: "Nope" })).rejects.toThrow("Booking not found");
    await expect(provider.assignDocumentToTrip("missing", null)).rejects.toThrow("Document not found");
  });
});
