// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { Booking, DocumentRecord, Trip, User } from "../model";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import { withUserId } from "../providers/user-context";
import { generateTripReport, loadTripReportReceipts, withTimeout } from "./generate-trip-report";

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

describe("withTimeout", () => {
  it("passes through the resolved value", async () => {
    await expect(withTimeout("fast step", 1_000, Promise.resolve(42))).resolves.toBe(42);
  });

  it("rejects with the step label when the promise hangs", async () => {
    const never = new Promise<void>(() => undefined);
    await expect(withTimeout("hung step", 20, never)).rejects.toThrow('Step "hung step" timed out');
  });
});

describe("generateTripReport instrumentation", () => {
  const brokenReceipt: DocumentRecord = {
    ...gbpReceipt,
    id: "document_broken",
    tripId: trip.id,
    storageKey: "documents/broken.pdf",
    originalFileName: "broken.pdf",
    receiptPurpose: "Hotel",
  };

  function makeStorage(stored: Record<string, Buffer>): DocumentStorageProvider {
    return {
      storeTextDocument: () => Promise.reject(new Error("not used")),
      storeBase64Document: () => Promise.reject(new Error("not used")),
      storePdfDocument: () => Promise.reject(new Error("not used")),
      storeBuffer: async ({ key, buffer }) => {
        stored[key] = buffer;
      },
      readDocument: async (storageKey) => {
        if (storageKey.includes("broken")) throw new Error("simulated R2 outage");
        return { base64: Buffer.from("%PDF-fake").toString("base64") };
      },
    };
  }

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.AUTH_FROM_EMAIL;
  });

  it("logs per-step progress, logs download failures, and still ships the report", async () => {
    const state = new LocalStateProvider({
      users: [user],
      trips: [trip],
      bookings: [booking],
      documents: [gbpReceipt, brokenReceipt],
    });
    const stored: Record<string, Buffer> = {};

    await withUserId(user.id, () =>
      generateTripReport(state, makeStorage(stored), {
        tripId: trip.id,
        userId: user.id,
        siteUrl: "https://tripstar.example",
      }),
    );

    // ZIP was stored despite the broken receipt
    const storedKeys = Object.keys(stored);
    expect(storedKeys).toHaveLength(1);
    expect(storedKeys[0]).toMatch(/^reports\/.+\.zip$/);

    const messages = (await state.listActivity(user.id))
      .filter((e) => e.scope === "report")
      .map((e) => `${e.level}: ${e.message}`);

    // fine-grained progress entries
    expect(messages.some((m) => m.includes("Report generation started"))).toBe(true);
    expect(messages.some((m) => m.includes("loaded trip #200 with 2 receipt(s)"))).toBe(true);
    expect(messages.some((m) => m.includes("order PDF rendered"))).toBe(true);
    expect(messages.some((m) => m.includes("financial report PDF rendered"))).toBe(true);
    expect(messages.some((m) => m.includes("receipt.pdf"))).toBe(true);
    expect(messages.some((m) => m.includes("ZIP built"))).toBe(true);
    expect(messages.some((m) => m.includes("ZIP stored"))).toBe(true);
    expect(messages.some((m) => m.includes("Report generation finished for trip #200"))).toBe(true);

    // the broken receipt shows up as an error entry, not silently skipped
    expect(messages.some((m) => m.startsWith("error:") && m.includes("broken.pdf") && m.includes("simulated R2 outage"))).toBe(true);

    // email not configured → explicitly logged as skipped
    expect(messages.some((m) => m.includes("email skipped"))).toBe(true);
  });

  it("logs a failure entry naming the step when the run aborts", async () => {
    const state = new LocalStateProvider({
      users: [user],
      trips: [trip],
      bookings: [booking],
      documents: [gbpReceipt],
    });
    const storage = makeStorage({});
    storage.storeBuffer = () => Promise.reject(new Error("R2 write refused"));

    await expect(
      withUserId(user.id, () =>
        generateTripReport(state, storage, { tripId: trip.id, userId: user.id, siteUrl: "https://tripstar.example" }),
      ),
    ).rejects.toThrow("R2 write refused");

    const errors = (await state.listActivity(user.id)).filter((e) => e.scope === "report" && e.level === "error");
    expect(errors.some((e) => e.message.includes('failed at step "store ZIP"') && e.message.includes("R2 write refused"))).toBe(true);
  });
});
