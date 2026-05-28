import { describe, expect, it } from "vitest";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import { assignBookingToTrip, deleteBooking, updateBooking } from "./bookings";
import type { Booking, DocumentRecord, Trip } from "../model";

const now = "2026-05-26T09:00:00.000Z";
const trip: Trip = {
  id: "trip_200",
  tripNumber: "200",
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
  timePoints: [],
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
const document: DocumentRecord = {
  id: "document_1",
  tripId: null,
  storageKey: "documents/one.pdf",
  originalFileName: "one.pdf",
  mimeType: "application/pdf",
  sourceType: "upload",
  sourceEmailIngestId: null,
  extractedText: null,
  isReceipt: false,
  receiptAmount: null,
  receiptCurrency: null,
  receiptDate: null,
  receiptPurpose: null,
  receiptType: null,
  receiptJson: null,
  processingStatus: "ready",
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

  it("deletes the source document when its last booking is deleted", async () => {
    const provider = new LocalStateProvider({
      bookings: [{ ...booking, sourceDocumentId: "document_1" }],
      documents: [document],
    });

    const result = await deleteBooking(provider, "booking_1");

    expect(result.deletedDocumentId).toBe("document_1");
    await expect(provider.listBookings()).resolves.toEqual([]);
    await expect(provider.listDocuments()).resolves.toEqual([]);
  });

  it("keeps a receipt document when its last booking is deleted", async () => {
    const receiptDocument = { ...document, isReceipt: true };
    const provider = new LocalStateProvider({
      bookings: [{ ...booking, sourceDocumentId: "document_1" }],
      documents: [receiptDocument],
    });

    const result = await deleteBooking(provider, "booking_1");

    expect(result.deletedDocumentId).toBeNull();
    await expect(provider.listBookings()).resolves.toEqual([]);
    await expect(provider.listDocuments()).resolves.toHaveLength(1);
  });

  it("keeps the source document when other bookings still reference it", async () => {
    const provider = new LocalStateProvider({
      bookings: [
        { ...booking, sourceDocumentId: "document_1" },
        { ...booking, id: "booking_2", sourceDocumentId: "document_1" },
      ],
      documents: [document],
    });

    const result = await deleteBooking(provider, "booking_1");

    expect(result.deletedDocumentId).toBeNull();
    await expect(provider.listBookings()).resolves.toHaveLength(1);
    await expect(provider.listDocuments()).resolves.toHaveLength(1);
  });
});
