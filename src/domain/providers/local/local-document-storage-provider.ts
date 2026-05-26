import type { DocumentStorageProvider, StoredDocument } from "../document-storage-provider";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export class LocalDocumentStorageProvider implements DocumentStorageProvider {
  constructor(private readonly storageDir: string) {}

  async storeTextDocument(input: { text: string; originalFileName: string }): Promise<StoredDocument> {
    await mkdir(this.storageDir, { recursive: true });
    const storageKey = `documents/text/${randomUUID()}.txt`;
    const path = join(this.storageDir, storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.text, "utf8");
    return {
      storageKey,
      originalFileName: input.originalFileName,
      mimeType: "text/plain",
    };
  }

  async storeBase64Document(input: { base64: string; mimeType: string; originalFileName: string }): Promise<StoredDocument> {
    await mkdir(this.storageDir, { recursive: true });
    const extension = extensionForMimeType(input.mimeType);
    const storageKey = `documents/images/${randomUUID()}.${extension}`;
    const path = join(this.storageDir, storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(input.base64, "base64"));
    return {
      storageKey,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
    };
  }

  async storePdfDocument(input: { base64: string; originalFileName: string }): Promise<StoredDocument> {
    await mkdir(this.storageDir, { recursive: true });
    const storageKey = `documents/pdfs/${randomUUID()}.pdf`;
    const path = join(this.storageDir, storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(input.base64, "base64"));
    return {
      storageKey,
      originalFileName: input.originalFileName,
      mimeType: "application/pdf",
    };
  }
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}
