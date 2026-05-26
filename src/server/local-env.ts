import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let isLoaded = false;

export function loadLocalEnv(): void {
  if (isLoaded) return;
  isLoaded = true;

  const envPath = join(projectRoot(), ".env");
  if (!existsSync(envPath)) return;

  const values = parseEnvFile(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    values[key] = parseEnvValue(normalized.slice(separatorIndex + 1).trim());
  }
  return values;
}

function parseEnvValue(rawValue: string): string {
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    const inner = rawValue.slice(1, -1);
    return rawValue.startsWith('"') ? inner.replace(/\\n/g, "\n").replace(/\\"/g, '"') : inner;
  }

  const commentIndex = rawValue.search(/\s#/);
  return (commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue).trim();
}

function projectRoot(): string {
  const candidates = [
    process.env.TRIPSTAR_PROJECT_ROOT,
    process.env.PWD,
    process.env.INIT_CWD,
    resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
    process.cwd(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(join(candidate, "package.json"))) ?? process.cwd();
}
