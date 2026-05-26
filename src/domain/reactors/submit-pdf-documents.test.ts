import { describe, expect, it } from "vitest";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import type { BookingAnalysisProvider } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import { submitPdfDocuments } from "./submit-pdf-documents";

function createStorage(): DocumentStorageProvider {
  return {
    async storeTextDocument() {
      throw new Error("not used");
    },
    async storeBase64Document() {
      throw new Error("not used");
    },
    async storePdfDocument(input) {
      return {
        storageKey: `documents/pdfs/${input.originalFileName}`,
        originalFileName: input.originalFileName,
        mimeType: "application/pdf",
      };
    },
    async readDocument() {
      throw new Error("not used");
    },
  };
}

const analyzer: BookingAnalysisProvider = {
  async analyzeText() {
    throw new Error("not used");
  },
  async analyzeImage() {
    throw new Error("not used");
  },
  async analyzePdf() {
    return [
      {
        type: "train",
        title: "Train to Hamburg",
        startAt: "2026-07-01T09:00:00.000Z",
        endAt: null,
        fromText: "Berlin",
        toText: "Hamburg",
        travelers: [],
        serviceIdentifier: "ICE 100",
        operator: "DB",
        details: "Train to Hamburg",
        extractedJson: { test: true },
      },
    ];
  },
};

describe("submitPdfDocuments", () => {
  it("stores multiple PDFs and assigns extracted bookings to the selected trip", async () => {
    const state = new LocalStateProvider({ now: () => new Date("2026-05-26T09:00:00.000Z") });
    const trip = await state.createTrip({
      title: "Hamburg",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      places: "Hamburg",
      ownerUserId: "user_1",
      sharedWithUserIds: [],
    });

    const result = await submitPdfDocuments(state, createStorage(), analyzer, {
      tripId: trip.id,
      documents: [
        { base64: Buffer.from("%PDF 1").toString("base64"), originalFileName: "one.pdf" },
        { base64: Buffer.from("%PDF 2").toString("base64"), originalFileName: "two.pdf" },
      ],
    });

    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]).toMatchObject({ tripId: trip.id, sourceType: "upload", mimeType: "application/pdf" });
    expect(result.bookings).toHaveLength(2);
    expect(result.bookings[0]).toMatchObject({ tripId: trip.id, title: "Train to Hamburg" });
  });

  it("stores PDFs even when no bookings are found", async () => {
    const state = new LocalStateProvider({ now: () => new Date("2026-05-26T09:00:00.000Z") });
    const emptyAnalyzer: BookingAnalysisProvider = {
      async analyzeText() {
        throw new Error("not used");
      },
      async analyzeImage() {
        throw new Error("not used");
      },
      async analyzePdf() {
        return [];
      },
    };

    const result = await submitPdfDocuments(state, createStorage(), emptyAnalyzer, {
      tripId: null,
      documents: [{ base64: Buffer.from("%PDF").toString("base64"), originalFileName: "empty.pdf" }],
    });

    expect(result.documents).toHaveLength(1);
    expect(result.bookings).toEqual([]);
    await expect(state.listActivity()).resolves.toEqual([
      expect.objectContaining({
        scope: "documents",
        message: "PDF analyzed, no bookings extracted",
      }),
    ]);
  });

  it("rejects empty or non-PDF uploads", async () => {
    const state = new LocalStateProvider({ now: () => new Date("2026-05-26T09:00:00.000Z") });

    await expect(submitPdfDocuments(state, createStorage(), analyzer, { tripId: null, documents: [] })).rejects.toThrow(
      "At least one PDF document is required.",
    );
    await expect(
      submitPdfDocuments(state, createStorage(), analyzer, {
        tripId: null,
        documents: [{ base64: Buffer.from("not pdf").toString("base64"), originalFileName: "booking.txt" }],
      }),
    ).rejects.toThrow("Only PDF documents are accepted.");
    await expect(
      submitPdfDocuments(state, createStorage(), analyzer, {
        tripId: null,
        documents: [{ base64: "", originalFileName: "booking.pdf" }],
      }),
    ).rejects.toThrow("PDF document is empty.");
  });

  it("stores failed PDFs and records analysis errors", async () => {
    const state = new LocalStateProvider({ now: () => new Date("2026-05-26T09:00:00.000Z") });
    const failingAnalyzer: BookingAnalysisProvider = {
      async analyzeText() {
        throw new Error("not used");
      },
      async analyzeImage() {
        throw new Error("not used");
      },
      async analyzePdf() {
        throw new Error("pdf down");
      },
    };

    await expect(
      submitPdfDocuments(state, createStorage(), failingAnalyzer, {
        tripId: null,
        documents: [{ base64: Buffer.from("%PDF").toString("base64"), originalFileName: "failed.pdf" }],
      }),
    ).rejects.toThrow("pdf down");

    await expect(state.listDocuments()).resolves.toEqual([
      expect.objectContaining({ originalFileName: "failed.pdf", processingStatus: "failed" }),
    ]);
    await expect(state.listActivity()).resolves.toEqual([
      expect.objectContaining({ level: "error", scope: "documents", message: "PDF analysis failed" }),
    ]);
  });
});
