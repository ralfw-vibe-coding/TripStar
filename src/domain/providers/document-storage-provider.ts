export interface StoredDocument {
  storageKey: string;
  originalFileName: string;
  mimeType: string;
}

export interface DocumentStorageProvider {
  storeTextDocument(input: { text: string; originalFileName: string }): Promise<StoredDocument>;
  storeBase64Document(input: { base64: string; mimeType: string; originalFileName: string }): Promise<StoredDocument>;
  storePdfDocument(input: { base64: string; originalFileName: string }): Promise<StoredDocument>;
}
