import { describe, expect, it } from "vitest";
import type { IngestPart, User } from "../model";
import type { BookingAnalysisProvider, BookingAnalysisResult } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import { withUserId } from "../providers/user-context";
import { hasReimburseTag, processIngestEmail, receiveIngestPart } from "./ingest-email";

const now = "2026-06-17T09:00:00.000Z";

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

const ingestPart: IngestPart = {
  txId: "email_1",
  part: 1,
  of: 1,
  sender: "work@example.com",
  document: {
    filename: "email-body.txt",
    mimeType: "text/plain",
    data: Buffer.from("booking").toString("base64"),
  },
};

describe("email ingest receiving", () => {
  it("accepts sender addresses from the ingest email allowlist", async () => {
    const state = new LocalStateProvider({
      now: () => new Date(now),
      users: [user],
      ingestEmailAddresses: [
        { email: "work@example.com", userId: user.id, isPrimary: false, createdAt: now },
      ],
    });

    await expect(receiveIngestPart(state, ingestPart)).resolves.toEqual({ status: "ready_to_process", userId: user.id });
  });

  it("rejects sender addresses that are not in the ingest email allowlist", async () => {
    const state = new LocalStateProvider({
      now: () => new Date(now),
      users: [user],
      ingestEmailAddresses: [],
    });

    await expect(receiveIngestPart(state, ingestPart)).resolves.toEqual({ status: "unknown_sender" });
  });
});

describe("hasReimburseTag", () => {
  it("matches #reimburse, #reimbursed and #reimbursement case-insensitively anywhere in the subject", () => {
    expect(hasReimburseTag("Taxi receipt #reimburse")).toBe(true);
    expect(hasReimburseTag("#REIMBURSE hotel")).toBe(true);
    expect(hasReimburseTag("Invoice #reimburse please")).toBe(true);
    expect(hasReimburseTag("Note about #reimbursement")).toBe(true);
    expect(hasReimburseTag("Already #REIMBURSED last week")).toBe(true);
  });

  it("does not match unrelated words or absent/empty subjects", () => {
    expect(hasReimburseTag("Note about #reimbursements")).toBe(false);
    expect(hasReimburseTag("plain subject, no tag")).toBe(false);
    expect(hasReimburseTag(null)).toBe(false);
    expect(hasReimburseTag(undefined)).toBe(false);
    expect(hasReimburseTag("")).toBe(false);
  });
});

describe("processIngestEmail #reimburse override", () => {
  function storage(): DocumentStorageProvider {
    return {
      async storeTextDocument(input) {
        return { storageKey: `documents/${input.originalFileName}.txt`, originalFileName: input.originalFileName, mimeType: "text/plain" };
      },
      async storeBase64Document() { throw new Error("not used"); },
      async storePdfDocument() { throw new Error("not used"); },
      async readDocument() { throw new Error("not used"); },
      async storeBuffer() { throw new Error("not used"); },
    };
  }

  function receiptAnalyzer(receiptType: "reimbursable" | "report_only" | null): BookingAnalysisProvider {
    const result: BookingAnalysisResult = {
      bookings: [],
      receiptInfo: {
        isReceipt: true,
        receiptAmount: 42,
        receiptCurrency: "EUR",
        receiptDate: "2026-06-17",
        receiptPurpose: "Taxi",
        receiptType,
      },
    };
    return {
      async analyzeText() { return result; },
      async analyzeImage() { throw new Error("not used"); },
      async analyzePdf() { throw new Error("not used"); },
    };
  }

  function receiptPart(subject: string | null): IngestPart {
    return {
      txId: "email_reimburse",
      part: 1,
      of: 1,
      sender: "work@example.com",
      subject,
      document: { filename: "email-body.txt", mimeType: "text/plain", data: Buffer.from("Taxi 42 EUR").toString("base64") },
    };
  }

  async function runWith(subject: string | null, analyzerReceiptType: "reimbursable" | "report_only" | null) {
    const state = new LocalStateProvider({ now: () => new Date(now), users: [user] });
    await state.storeIngestPart(receiptPart(subject));
    await withUserId(user.id, () =>
      processIngestEmail(state, storage(), receiptAnalyzer(analyzerReceiptType), "email_reimburse", "work@example.com", user.id),
    );
    return state.listDocuments();
  }

  it("marks the receipt reimbursable when the subject carries #reimburse", async () => {
    const documents = await runWith("Taxi ride #reimburse", "report_only");
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ isReceipt: true, receiptType: "reimbursable" });
  });

  it("leaves the analyzer's classification untouched without the tag", async () => {
    const documents = await runWith("Taxi ride", "report_only");
    expect(documents[0]).toMatchObject({ isReceipt: true, receiptType: "report_only" });
  });

  it("does not turn a non-receipt into a receipt", async () => {
    const state = new LocalStateProvider({ now: () => new Date(now), users: [user] });
    await state.storeIngestPart(receiptPart("Itinerary #reimburse"));
    const nonReceiptAnalyzer: BookingAnalysisProvider = {
      async analyzeText() {
        return { bookings: [], receiptInfo: { isReceipt: false, receiptAmount: null, receiptCurrency: null, receiptDate: null, receiptPurpose: null, receiptType: null } };
      },
      async analyzeImage() { throw new Error("not used"); },
      async analyzePdf() { throw new Error("not used"); },
    };
    await withUserId(user.id, () =>
      processIngestEmail(state, storage(), nonReceiptAnalyzer, "email_reimburse", "work@example.com", user.id),
    );
    const documents = await state.listDocuments();
    expect(documents[0]).toMatchObject({ isReceipt: false, receiptType: null });
  });
});
