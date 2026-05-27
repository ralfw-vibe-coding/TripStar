import { OpenAIBookingAnalysisProvider } from "../domain/providers/openai/openai-booking-analysis-provider";
import { LocalDocumentStorageProvider } from "../domain/providers/local/local-document-storage-provider";
import { R2DocumentStorageProvider } from "../domain/providers/remote/r2-document-storage-provider";
import type { DocumentStorageProvider } from "../domain/providers/document-storage-provider";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export function createBookingAnalysisProvider(): OpenAIBookingAnalysisProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for booking analysis.");
  }
  return new OpenAIBookingAnalysisProvider(apiKey, process.env.OPENAI_MODEL ?? "gpt-5.4-mini");
}

export function createDocumentStorageProvider(): DocumentStorageProvider {
  if (process.env.TRIPSTAR_FILE_STORAGE === "r2") {
    return new R2DocumentStorageProvider({
      bucket: requiredEnv("R2_BUCKET"),
      accountId: requiredEnv("R2_ACCOUNT_ID"),
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    });
  }
  const localPersistenceDir = process.env.LOCAL_PERSISTENCE_DIR ?? "./data";
  return new LocalDocumentStorageProvider(join(resolveLocalPersistenceDir(localPersistenceDir), "storage"));
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function resolveLocalPersistenceDir(dir: string): string {
  if (isAbsolute(dir)) return dir;
  return resolve(projectRoot(), dir);
}

function projectRoot(): string {
  const candidates = [
    process.env.TRIPSTAR_PROJECT_ROOT,
    process.env.PWD,
    process.env.INIT_CWD,
    process.cwd(),
  ].filter((c): c is string => Boolean(c));
  return candidates.find((c) => existsSync(join(c, "package.json"))) ?? process.cwd();
}
