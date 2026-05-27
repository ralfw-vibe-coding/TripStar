import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const sql = neon(databaseUrl);
const migrationsDir = resolve("sql", "migrations");
const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

await sql`create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
)`;

for (const file of files) {
  const applied = await sql`select id from schema_migrations where id = ${file} limit 1`;
  if (applied.length > 0) {
    console.log(`skip ${file}`);
    continue;
  }

  const statements = splitSqlStatements(readFileSync(join(migrationsDir, file), "utf8"));
  for (const statement of statements) {
    await sql.query(statement);
  }
  await sql`insert into schema_migrations (id) values (${file})`;
  console.log(`applied ${file}`);
}

function splitSqlStatements(sqlText) {
  return sqlText
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function loadEnv() {
  const envPath = resolve(".env");
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
