import { describe, expect, it, vi } from "vitest";
import type { BookingAnalysisProvider } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider, StoredDocument } from "../providers/document-storage-provider";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import { processAnalysisJob, submitAnalysisJob } from "./analysis-jobs";

function createStorage(): DocumentStorageProvider {
  const stored: StoredDocument = {
    storageKey: "documents/test.txt",
    originalFileName: "Texteingabe",
    mimeType: "text/plain",
  };
  return {
    async storeTextDocument() {
      return stored;
    },
    async storeBase64Document() {
      return { ...stored, originalFileName: "Clipboard screenshot", mimeType: "image/png" };
    },
    async storePdfDocument(input) {
      return { ...stored, originalFileName: input.originalFileName, mimeType: "application/pdf" };
    },
    async readDocument() {
      return { base64: "dGVzdA==" };
    },
  };
}

const analyzer: BookingAnalysisProvider = {
  async analyzeText() {
    return {
      bookings: [
        {
          type: "other",
          title: "Shuttle",
          startAt: "2026-05-10T08:00:00.000Z",
          endAt: null,
          fromText: null,
          toText: "Sofia",
          travelers: [],
          serviceIdentifier: null,
          operator: null,
          details: "Airport shuttle",
          extractedJson: null,
        },
      ],
      receiptInfo: { isReceipt: false, receiptAmount: null, receiptCurrency: null, receiptDate: null, receiptPurpose: null, receiptType: null },
    };
  },
  async analyzeImage() {
    return { bookings: [], receiptInfo: { isReceipt: false, receiptAmount: null, receiptCurrency: null, receiptDate: null, receiptPurpose: null, receiptType: null } };
  },
  async analyzePdf() {
    return { bookings: [], receiptInfo: { isReceipt: false, receiptAmount: null, receiptCurrency: null, receiptDate: null, receiptPurpose: null, receiptType: null } };
  },
};

describe("analysis jobs", () => {
  it("creates a queued job and processes it asynchronously", async () => {
    vi.useFakeTimers();
    const state = new LocalStateProvider();

    const submitted = await submitAnalysisJob(state, createStorage(), analyzer, {
      sourceType: "text",
      text: "Shuttle to Sofia on 10 May",
      tripId: null,
      currentUserId: "user_1",
    });

    await expect(state.listAnalysisJobs()).resolves.toMatchObject([{ id: submitted.job.id, status: "queued", sourceType: "text" }]);

    await vi.runAllTimersAsync();

    await expect(state.listAnalysisJobs()).resolves.toMatchObject([{ id: submitted.job.id, status: "done", bookingCount: 1 }]);
    await expect(state.listBookings()).resolves.toMatchObject([{ title: "Shuttle", participantUserIds: ["user_1"] }]);
    vi.useRealTimers();
  });

  it("marks failed jobs and records the error message", async () => {
    const state = new LocalStateProvider();
    const job = await state.createAnalysisJob({
      sourceType: "text",
      documentName: "Texteingabe",
      tripId: null,
      currentUserId: "user_1",
    });
    const failingAnalyzer: BookingAnalysisProvider = {
      async analyzeText() {
        throw new Error("OpenAI unavailable");
      },
      async analyzeImage() {
        return { bookings: [], receiptInfo: { isReceipt: false, receiptAmount: null, receiptCurrency: null, receiptDate: null, receiptPurpose: null, receiptType: null } };
      },
      async analyzePdf() {
        return { bookings: [], receiptInfo: { isReceipt: false, receiptAmount: null, receiptCurrency: null, receiptDate: null, receiptPurpose: null, receiptType: null } };
      },
    };

    await processAnalysisJob(state, createStorage(), failingAnalyzer, job.id, {
      sourceType: "text",
      text: "booking",
      tripId: null,
      currentUserId: "user_1",
    });

    await expect(state.listAnalysisJobs()).resolves.toMatchObject([{ id: job.id, status: "failed", error: "OpenAI unavailable" }]);
  });

  it("uses compact document names for queued pdf batches", async () => {
    vi.useFakeTimers();
    const state = new LocalStateProvider();
    const submitted = await submitAnalysisJob(state, createStorage(), analyzer, {
      sourceType: "pdf",
      documents: [
        { base64: "JVBERi0=", originalFileName: "one.pdf" },
        { base64: "JVBERi0=", originalFileName: "two.pdf" },
      ],
      tripId: null,
      currentUserId: "user_1",
    });

    await expect(state.listAnalysisJobs()).resolves.toMatchObject([{ id: submitted.job.id, documentName: "2 PDF documents" }]);
    vi.clearAllTimers();
    vi.useRealTimers();
  });
});
