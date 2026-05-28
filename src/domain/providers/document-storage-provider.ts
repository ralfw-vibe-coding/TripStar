export interface StoredDocument {
  storageKey: string;
  originalFileName: string;
  mimeType: string;
}

export interface DocumentStorageProvider {
  storeTextDocument(input: { text: string; originalFileName: string }): Promise<StoredDocument>;
  storeBase64Document(input: { base64: string; mimeType: string; originalFileName: string }): Promise<StoredDocument>;
  storePdfDocument(input: { base64: string; originalFileName: string }): Promise<StoredDocument>;
  /** Store arbitrary binary data at the given storage key. */
  storeBuffer(input: { key: string; buffer: Buffer; mimeType: string }): Promise<void>;
  readDocument(storageKey: string): Promise<{ base64: string }>;
}
