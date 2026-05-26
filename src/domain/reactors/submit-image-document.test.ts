import { describe, expect, it } from "vitest";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import type { BookingAnalysisProvider } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import { submitImageDocument } from "./submit-image-document";

function createStorage(): DocumentStorageProvider & { storedCount: number } {
  return {
    storedCount: 0,
    async storeTextDocument() {
      throw new Error("not used");
    },
    async storeBase64Document() {
      this.storedCount += 1;
      return {
        storageKey: "documents/images/test.png",
        originalFileName: "Clipboard screenshot",
        mimeType: "image/png",
      };
    },
    async storePdfDocument() {
      throw new Error("not used");
    },
  };
}

const analyzer: BookingAnalysisProvider = {
  async analyzeText() {
    throw new Error("not used");
  },
  async analyzeImage() {
    return [
      {
        type: "lodging",
        title: "Hotel Berlin",
        startAt: "2026-07-01T15:00:00.000Z",
        endAt: "2026-07-02T10:00:00.000Z",
        fromText: null,
        toText: "Berlin",
        travelers: [],
        serviceIdentifier: null,
        operator: "Hotel",
        details: "Hotel Berlin",
        extractedJson: { test: true },
      },
    ];
  },
  async analyzePdf() {
    throw new Error("not used");
  },
};

describe("submitImageDocument", () => {
  it("stores a screenshot and creates associated bookings", async () => {
    const state = new LocalStateProvider({ now: () => new Date("2026-05-26T09:00:00.000Z") });
    const storage = createStorage();

    const result = await submitImageDocument(state, storage, analyzer, {
      base64: Buffer.from("image bytes").toString("base64"),
      mimeType: "image/png",
      tripId: null,
    });

    expect(result.document).toMatchObject({
      storageKey: "documents/images/test.png",
      sourceType: "screenshot",
      extractedText: null,
    });
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]).toMatchObject({
      sourceDocumentId: result.document?.id,
      title: "Hotel Berlin",
    });
  });

  it("does not store a screenshot when no bookings are found", async () => {
    const state = new LocalStateProvider({ now: () => new Date("2026-05-26T09:00:00.000Z") });
    const storage = createStorage();
    const emptyAnalyzer: BookingAnalysisProvider = {
      async analyzeText() {
        throw new Error("not used");
      },
      async analyzeImage() {
        return [];
      },
      async analyzePdf() {
        throw new Error("not used");
      },
    };

    const result = await submitImageDocument(state, storage, emptyAnalyzer, {
      base64: Buffer.from("image bytes").toString("base64"),
      mimeType: "image/png",
      tripId: null,
    });

    expect(result).toEqual({ document: null, bookings: [] });
    expect(storage.storedCount).toBe(0);
  });

  it("records failed screenshot analyses in the activity log", async () => {
    const state = new LocalStateProvider({ now: () => new Date("2026-05-26T09:00:00.000Z") });
    const failingAnalyzer: BookingAnalysisProvider = {
      async analyzeText() {
        throw new Error("not used");
      },
      async analyzeImage() {
        throw new Error("vision down");
      },
      async analyzePdf() {
        throw new Error("not used");
      },
    };

    await expect(
      submitImageDocument(state, createStorage(), failingAnalyzer, {
        base64: Buffer.from("image bytes").toString("base64"),
        mimeType: "image/png",
        tripId: null,
      }),
    ).rejects.toThrow("vision down");

    await expect(state.listActivity()).resolves.toEqual([
      expect.objectContaining({
        level: "error",
        scope: "documents",
        message: "Screenshot analysis failed",
      }),
    ]);
  });
});
