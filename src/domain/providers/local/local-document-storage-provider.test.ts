import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { LocalDocumentStorageProvider } from "./local-document-storage-provider";

describe("LocalDocumentStorageProvider", () => {
  it("stores text documents below the configured storage directory", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "tripstar-documents-"));
    const provider = new LocalDocumentStorageProvider(storageDir);

    const stored = await provider.storeTextDocument({
      text: "Booking confirmation",
      originalFileName: "Texteingabe",
    });

    expect(stored).toMatchObject({
      originalFileName: "Texteingabe",
      mimeType: "text/plain",
    });
    expect(stored.storageKey).toMatch(/^documents\/text\/.+\.txt$/);
    await expect(readFile(join(storageDir, stored.storageKey), "utf8")).resolves.toBe("Booking confirmation");
  });

  it("stores base64 image documents below the configured storage directory", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "tripstar-images-"));
    const provider = new LocalDocumentStorageProvider(storageDir);

    const stored = await provider.storeBase64Document({
      base64: Buffer.from("image bytes").toString("base64"),
      mimeType: "image/png",
      originalFileName: "Clipboard screenshot",
    });

    expect(stored).toMatchObject({
      originalFileName: "Clipboard screenshot",
      mimeType: "image/png",
    });
    expect(stored.storageKey).toMatch(/^documents\/images\/.+\.png$/);
    await expect(readFile(join(storageDir, stored.storageKey), "utf8")).resolves.toBe("image bytes");
  });

  it("stores PDF documents below the configured storage directory", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "tripstar-pdfs-"));
    const provider = new LocalDocumentStorageProvider(storageDir);

    const stored = await provider.storePdfDocument({
      base64: Buffer.from("%PDF").toString("base64"),
      originalFileName: "booking.pdf",
    });

    expect(stored).toMatchObject({
      originalFileName: "booking.pdf",
      mimeType: "application/pdf",
    });
    expect(stored.storageKey).toMatch(/^documents\/pdfs\/.+\.pdf$/);
    await expect(readFile(join(storageDir, stored.storageKey), "utf8")).resolves.toBe("%PDF");
    await expect(provider.readDocument(stored.storageKey)).resolves.toEqual({ base64: Buffer.from("%PDF").toString("base64") });
  });
});
