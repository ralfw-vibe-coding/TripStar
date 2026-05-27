import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DocumentStorageProvider, StoredDocument } from "../document-storage-provider";
import { randomUUID } from "node:crypto";

export interface R2DocumentStorageOptions {
  bucket: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class R2DocumentStorageProvider implements DocumentStorageProvider {
  private readonly client: S3Client;

  constructor(private readonly options: R2DocumentStorageOptions) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async storeTextDocument(input: { text: string; originalFileName: string }): Promise<StoredDocument> {
    const storageKey = `documents/${randomUUID()}.txt`;
    await this.putObject(storageKey, Buffer.from(input.text, "utf8"), "text/plain");
    return { storageKey, originalFileName: input.originalFileName, mimeType: "text/plain" };
  }

  async storeBase64Document(input: { base64: string; mimeType: string; originalFileName: string }): Promise<StoredDocument> {
    const storageKey = `documents/${randomUUID()}.${extensionForMimeType(input.mimeType)}`;
    await this.putObject(storageKey, Buffer.from(input.base64, "base64"), input.mimeType);
    return { storageKey, originalFileName: input.originalFileName, mimeType: input.mimeType };
  }

  async storePdfDocument(input: { base64: string; originalFileName: string }): Promise<StoredDocument> {
    const storageKey = `documents/${randomUUID()}.pdf`;
    await this.putObject(storageKey, Buffer.from(input.base64, "base64"), "application/pdf");
    return { storageKey, originalFileName: input.originalFileName, mimeType: "application/pdf" };
  }

  async readDocument(storageKey: string): Promise<{ base64: string }> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: storageKey }));
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Document not found in R2: ${storageKey}`);
    }
    return { base64: Buffer.from(bytes).toString("base64") };
  }

  private putObject(key: string, body: Buffer, contentType: string): Promise<unknown> {
    return this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}
