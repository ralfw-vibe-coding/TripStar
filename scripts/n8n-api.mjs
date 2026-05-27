#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

loadEnv();

const BASE_URL = (process.env.N8N_API_URL ?? "").replace(/\/$/, "");
const API_KEY = process.env.N8N_API_KEY ?? "";

if (!BASE_URL || !API_KEY) {
  throw new Error("N8N_API_URL and N8N_API_KEY must be set in .env");
}

export async function n8nGet(path) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    headers: { "X-N8N-API-KEY": API_KEY },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

export async function n8nPut(path, body) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method: "PUT",
    headers: { "X-N8N-API-KEY": API_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

export async function n8nPost(path, body) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method: "POST",
    headers: { "X-N8N-API-KEY": API_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

export async function findWorkflowByName(name) {
  let cursor;
  do {
    const qs = cursor ? `?cursor=${cursor}&limit=50` : "?limit=50";
    const page = await n8nGet(`/workflows${qs}`);
    const match = page.data?.find((w) => w.name === name);
    if (match) return match;
    cursor = page.nextCursor;
  } while (cursor);
  return null;
}

export function saveWorkflowJson(workflow) {
  const dir = join(ROOT, "n8n-workflows");
  mkdirSync(dir, { recursive: true });
  const slug = workflow.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const path = join(dir, `${slug}.json`);
  writeFileSync(path, JSON.stringify(workflow, null, 2));
  console.log(`Saved: n8n-workflows/${slug}.json`);
  return path;
}

// --- CLI ---
const [, , command, ...args] = process.argv;

if (command === "list") {
  const page = await n8nGet("/workflows?limit=50");
  for (const w of page.data ?? []) {
    console.log(`${w.id.toString().padStart(4)}  ${w.active ? "✓" : " "}  ${w.name}`);
  }
} else if (command === "get") {
  const name = args.join(" ");
  const workflow = await findWorkflowByName(name);
  if (!workflow) { console.error(`Workflow not found: ${name}`); process.exit(1); }
  const full = await n8nGet(`/workflows/${workflow.id}`);
  saveWorkflowJson(full);
} else if (command === "update") {
  const name = args.join(" ");
  const slug = name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const filePath = join(ROOT, "n8n-workflows", `${slug}.json`);
  const workflow = JSON.parse(readFileSync(filePath, "utf8"));
  const { id, nodes, connections, staticData } = workflow;
  if (!id) { console.error("Workflow JSON has no id field."); process.exit(1); }
  const { executionOrder, callerPolicy, errorWorkflow, timezone, saveManualExecutions, saveExecutionProgress, saveDataSuccessExecution, saveDataErrorExecution } = workflow.settings ?? {};
  const settings = Object.fromEntries(
    Object.entries({ executionOrder, callerPolicy, errorWorkflow, timezone, saveManualExecutions, saveExecutionProgress, saveDataSuccessExecution, saveDataErrorExecution })
      .filter(([, v]) => v !== undefined)
  );
  const updated = await n8nPut(`/workflows/${id}`, { name: workflow.name, nodes, connections, settings, staticData });
  console.log(`Updated workflow ${updated.id}: ${updated.name}`);
} else {
  console.log("Usage:");
  console.log("  node scripts/n8n-api.mjs list");
  console.log("  node scripts/n8n-api.mjs get <workflow name>");
  console.log("  node scripts/n8n-api.mjs update <workflow name>   (reads from n8n-workflows/<slug>.json)");
}

function loadEnv() {
  try {
    const env = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of env.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) process.env[m[1]] ??= m[2];
    }
  } catch { /* no .env, rely on process.env */ }
}
