import { describe, expect, it } from "vitest";
import type { Booking, DocumentRecord, Trip, User } from "../model";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import { loadTripReportReceipts } from "./generate-trip-report";

const now = "2026-06-16T10:00:00.000Z";

const user: User = {
  id: "user_ralf",
  email: "ralf@example.com",
  shortCode: "RW",
  name: null,
  companyName: null,
  jobPosition: null,
  signatureEmployee: null,
  signatureManager: null,
  createdAt: now,
  updatedAt: now,
};

const trip: Trip = {
  id: "trip_200",
  tripNumber: "200",
  title: "London",
  ownerUserId: user.id,
  startDate: "2026-06-01",
  endDate: "2026-06-05",
  places: "London",
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
  tripId: trip.id,
  sourceDocumentId: "document_gbp",
  type: "other",
  title: "GBP receipt",
  startAt: "2026-06-02T10:00:00.000Z",
  endAt: null,
  timePoints: [],
  fromText: null,
  toText: null,
  travelers: [],
  participantUserIds: [user.id],
  status: "reviewed",
  serviceIdentifier: null,
  operator: null,
  details: "",
  extractedJson: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

const gbpReceipt: DocumentRecord = {
  id: "document_gbp",
  tripId: null,
  storageKey: "documents/receipt.pdf",
  originalFileName: "receipt.pdf",
  mimeType: "application/pdf",
  sourceType: "upload",
  sourceEmailIngestId: null,
  extractedText: null,
  isReceipt: true,
  receiptAmount: 42,
  receiptCurrency: "GBP",
  receiptAmountEur: 49.5,
  receiptDate: "2026-06-02",
  receiptPurpose: "Taxi London",
  receiptType: "reimbursable",
  receiptJson: null,
  processingStatus: "ready",
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

describe("trip report receipt selection", () => {
  it("includes receipts assigned to the trip through a booking document link", async () => {
    const state = new LocalStateProvider({
      users: [user],
      trips: [trip],
      bookings: [booking],
      documents: [gbpReceipt],
    });

    const receipts = await loadTripReportReceipts(state, user.id, trip.id);

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      id: "document_gbp",
      tripId: trip.id,
      receiptCurrency: "GBP",
      receiptAmountEur: 49.5,
    });
  });
});
