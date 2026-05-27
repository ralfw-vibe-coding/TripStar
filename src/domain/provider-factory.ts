import { LocalStateProvider } from "./providers/local/local-state-provider";
import { PostgresStateProvider } from "./providers/remote/postgres-state-provider";
import type { TripStarStateProvider } from "./providers/state-provider";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

declare global {
  var __tripstarStateProvider: TripStarStateProvider | null | undefined;
}

export function getStateProvider(): TripStarStateProvider {
  if (globalThis.__tripstarStateProvider) {
    return globalThis.__tripstarStateProvider;
  }

  const mode = process.env.TRIPSTAR_STATE_PROVIDER ?? "local";
  if (mode === "production" || mode === "remote" || mode === "postgres") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for remote state provider.");
    }
    const provider = new PostgresStateProvider(connectionString);
    globalThis.__tripstarStateProvider = provider;
    return provider;
  }

  const localPersistenceDir = process.env.LOCAL_PERSISTENCE_DIR ?? "./data";
  const provider = new LocalStateProvider({
    initialTripNumber: parseInitialTripNumber(process.env.INITIAL_TRIP_NUMBER),
    stateFilePath: join(resolveLocalPersistenceDir(localPersistenceDir), "state", "tripstar-state.json"),
  });
  globalThis.__tripstarStateProvider = provider;
  return provider;
}

export function setStateProviderForTests(provider: TripStarStateProvider | null): void {
  globalThis.__tripstarStateProvider = provider;
}

function parseInitialTripNumber(value: string | undefined): number {
  if (!value) {
    return 200;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("INITIAL_TRIP_NUMBER must be a positive integer.");
  }

  return parsed;
}

function resolveLocalPersistenceDir(localPersistenceDir: string): string {
  if (isAbsolute(localPersistenceDir)) {
    return localPersistenceDir;
  }

  return resolve(projectRoot(), localPersistenceDir);
}

function projectRoot(): string {
  const candidates = [
    process.env.TRIPSTAR_PROJECT_ROOT,
    process.env.PWD,
    process.env.INIT_CWD,
    process.cwd(),
    importMetaProjectRoot(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const root = candidates.find((candidate) => existsSync(join(candidate, "package.json")));
  return root ?? process.cwd();
}

function importMetaProjectRoot(): string | null {
  try {
    return fileURLToPath(new URL("../..", import.meta.url));
  } catch {
    return null;
  }
}
