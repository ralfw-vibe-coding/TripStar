#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# Parse a key from .env (strips quotes, skips comments)
env_value() {
  grep -E "^${1}=" "$ENV_FILE" | head -1 \
    | sed 's/^[^=]*=//' \
    | sed 's/^"\(.*\)"$/\1/' \
    | sed "s/^'\(.*\)'$/\1/"
}

DATABASE_URL=$(env_value "DATABASE_URL")
R2_BUCKET=$(env_value "R2_BUCKET")
R2_ACCOUNT_ID=$(env_value "R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID=$(env_value "R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY=$(env_value "R2_SECRET_ACCESS_KEY")
STATE_PROVIDER=$(env_value "TRIPSTAR_STATE_PROVIDER")
FILE_STORAGE=$(env_value "TRIPSTAR_FILE_STORAGE")
LOCAL_DIR=$(env_value "LOCAL_PERSISTENCE_DIR")

echo ""
echo "╔════════════════════════════════════════╗"
echo "║      TripStar — Reset Database         ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "  Wird GELÖSCHT:"
echo "    • Trips, Bookings, Dokumente"
echo "    • Analysis-Jobs, Activity-Log"
echo "    • OTP-Challenges, Auth-Sessions"
echo "    • Ingest-Parts"
if [[ "$FILE_STORAGE" == "r2" ]]; then
  echo "    • R2-Dateien (Bucket: $R2_BUCKET)"
elif [[ "$FILE_STORAGE" == "local" && -n "$LOCAL_DIR" ]]; then
  echo "    • Lokale Dateien ($LOCAL_DIR)"
fi
echo ""
echo "  Bleibt ERHALTEN:"
echo "    • Users"
echo ""
read -r -p "  Sicher? Tippe 'yes' zum Bestätigen: " CONFIRM
echo ""

if [[ "$CONFIRM" != "yes" ]]; then
  echo "Abgebrochen."
  exit 0
fi

# ── Postgres ─────────────────────────────────────────────────────────────────
if [[ "$STATE_PROVIDER" == "postgres" ]]; then
  # psql ist bei brew install libpq nicht automatisch im PATH
  PSQL=psql
  for candidate in \
    /opt/homebrew/opt/libpq/bin/psql \
    /usr/local/opt/libpq/bin/psql; do
    if [[ -x "$candidate" ]]; then PSQL="$candidate"; break; fi
  done
  if ! command -v "$PSQL" &>/dev/null; then
    echo "✗  psql nicht gefunden. Bitte PostgreSQL-Client installieren (brew install libpq)."
    exit 1
  fi
  echo "  Postgres wird zurückgesetzt..."
  "$PSQL" "$DATABASE_URL" <<SQL
DELETE FROM ingest_parts;
DELETE FROM activity_log;
DELETE FROM analysis_jobs;
DELETE FROM bookings;
DELETE FROM documents;
DELETE FROM trips;
DELETE FROM auth_sessions;
DELETE FROM otp_challenges;
SQL
  echo "  ✓ Postgres-Tabellen geleert."

# ── Lokaler State ─────────────────────────────────────────────────────────────
elif [[ "$STATE_PROVIDER" == "local" && -n "$LOCAL_DIR" ]]; then
  STATE_FILE="$SCRIPT_DIR/$LOCAL_DIR/state.json"
  if [[ -f "$STATE_FILE" ]]; then
    # Nur users behalten, alles andere leeren
    node -e "
      const fs = require('fs');
      const state = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8'));
      const reset = {
        ...state,
        trips: [],
        bookings: [],
        documents: [],
        analysisJobs: [],
        activityLog: [],
        otpChallenges: [],
        authSessions: [],
        ingestParts: [],
      };
      fs.writeFileSync('$STATE_FILE', JSON.stringify(reset, null, 2));
    "
    echo "  ✓ Lokaler State zurückgesetzt (users behalten)."
  else
    echo "  ⚠  Keine state.json unter $STATE_FILE gefunden."
  fi
fi

# ── R2 ────────────────────────────────────────────────────────────────────────
if [[ "$FILE_STORAGE" == "r2" ]]; then
  echo "  R2-Bucket wird geleert ($R2_BUCKET)..."
  node --input-type=module <<EOF
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "auto",
  endpoint: "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "${R2_ACCESS_KEY_ID}",
    secretAccessKey: "${R2_SECRET_ACCESS_KEY}",
  },
});

let deleted = 0;
let token;
do {
  const list = await client.send(new ListObjectsV2Command({
    Bucket: "${R2_BUCKET}",
    ContinuationToken: token,
  }));
  const objects = list.Contents ?? [];
  if (objects.length > 0) {
    await client.send(new DeleteObjectsCommand({
      Bucket: "${R2_BUCKET}",
      Delete: { Objects: objects.map((o) => ({ Key: o.Key })) },
    }));
    deleted += objects.length;
  }
  token = list.IsTruncated ? list.NextContinuationToken : undefined;
} while (token);

console.log("  ✓ R2-Bucket geleert (" + deleted + " Datei(en) gelöscht).");
EOF

# ── Lokaler Datei-Storage ─────────────────────────────────────────────────────
elif [[ "$FILE_STORAGE" == "local" && -n "$LOCAL_DIR" ]]; then
  DOC_DIR="$SCRIPT_DIR/$LOCAL_DIR/documents"
  if [[ -d "$DOC_DIR" ]]; then
    rm -rf "${DOC_DIR:?}"/*
    echo "  ✓ Lokale Dokumente gelöscht ($DOC_DIR)."
  else
    echo "  ⚠  Kein Dokumentenverzeichnis unter $DOC_DIR gefunden."
  fi
fi

echo ""
echo "  ✓ Reset abgeschlossen. Users sind erhalten."
echo ""
