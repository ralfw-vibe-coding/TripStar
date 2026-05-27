import { describe, expect, it } from "vitest";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import type { BookingAnalysisProvider } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import { submitTextDocument } from "./submit-text-document";

function createStorage(): DocumentStorageProvider & { storedCount: number } {
  return {
    storedCount: 0,
    async storeTextDocument() {
      this.storedCount += 1;
      return {
        storageKey: "documents/text/test.txt",
        originalFileName: "Texteingabe",
        mimeType: "text/plain",
      };
    },
    async storeBase64Document() {
      throw new Error("not used");
    },
    async storePdfDocument() {
      throw new Error("not used");
    },
    async readDocument() {
      throw new Error("not used");
    },
  };
}

const analyzer: BookingAnalysisProvider = {
  async analyzeText() {
    return [
      {
        type: "flight",
        title: "Flight to Berlin",
        startAt: "2026-07-01T09:00:00.000Z",
        endAt: null,
        fromText: "Sofia",
        toText: "Berlin",
        travelers: [],
        serviceIdentifier: "LH123",
        operator: "Lufthansa",
        details: "Flight to Berlin",
        extractedJson: { test: true },
      },
    ];
  },
  async analyzeImage() {
    throw new Error("not used");
  },
  async analyzePdf() {
    throw new Error("not used");
  },
};

describe("submitTextDocument", () => {
  it("stores a text document and creates associated bookings", async () => {
    const state = new LocalStateProvider({ now: () => new Date("2026-05-26T09:00:00.000Z") });
    const trip = await state.createTrip({
      title: "Berlin",
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      places: "Berlin",
      ownerUserId: "user_1",
      sharedWithUserIds: [],
    });
    const storage = createStorage();

    const result = await submitTextDocument(state, storage, analyzer, {
      text: "Flight to Berlin",
      tripId: trip.id,
      currentUserId: "user_1",
    });

    expect(result.document).toMatchObject({
      storageKey: "documents/text/test.txt",
      originalFileName: "Texteingabe",
      extractedText: "Flight to Berlin",
      sourceType: "text_input",
    });
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]).toMatchObject({
      tripId: trip.id,
      sourceDocumentId: result.document?.id,
      participantUserIds: ["user_1"],
      status: "reviewed",
      title: "Flight to Berlin",
    });
  });

  it("does not store a document when no bookings are found", async () => {
    const state = new LocalStateProvider({ now: () => new Date("2026-05-26T09:00:00.000Z") });
    const storage = createStorage();
    const emptyAnalyzer: BookingAnalysisProvider = {
      async analyzeText() {
        return [];
      },
      async analyzeImage() {
        throw new Error("not used");
      },
      async analyzePdf() {
        throw new Error("not used");
      },
    };

    const result = await submitTextDocument(state, storage, emptyAnalyzer, {
      text: "Just a note without a reservation.",
      tripId: null,
      currentUserId: "user_1",
    });

    expect(result).toEqual({ document: null, bookings: [] });
    expect(storage.storedCount).toBe(0);
    await expect(state.listDocuments()).resolves.toEqual([]);
    await expect(state.listBookings()).resolves.toEqual([]);
  });

  it("records failed text analyses in the activity log", async () => {
    const state = new LocalStateProvider({ now: () => new Date("2026-05-26T09:00:00.000Z") });
    const failingAnalyzer: BookingAnalysisProvider = {
      async analyzeText() {
        throw new Error("analysis down");
      },
      async analyzeImage() {
        throw new Error("not used");
      },
      async analyzePdf() {
        throw new Error("not used");
      },
    };

    await expect(
      submitTextDocument(state, createStorage(), failingAnalyzer, {
        text: "Flight to Berlin",
        tripId: null,
        currentUserId: "user_1",
      }),
    ).rejects.toThrow("analysis down");

    await expect(state.listActivity("test-user")).resolves.toEqual([
      expect.objectContaining({
        level: "error",
        scope: "documents",
        message: "Text document analysis failed",
      }),
    ]);
  });
});
