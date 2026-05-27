#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

case "${1:-}" in

  --client)
    # Nur Vite-Frontend, ohne Netlify Functions.
    # API-Aufrufe schlagen fehl — sinnvoll für reine UI-Arbeit ohne Backend.
    echo "[client] Starte Vite-Frontend (kein API)..."
    exec npx vite --host 127.0.0.1
    ;;

  --server)
    # Die Netlify Functions laufen in diesem Projekt eingebettet im Vite-Prozess.
    # Ein separater Serverstart erfordert die Netlify CLI:
    #   npm install -g netlify-cli
    #   netlify dev --no-open
    if command -v netlify &>/dev/null; then
      echo "[server] Starte Netlify Dev (Functions + Proxy, kein Vite HMR)..."
      exec netlify dev --no-open
    else
      echo "Netlify CLI nicht installiert."
      echo "Entweder installieren:  npm install -g netlify-cli"
      echo "Oder alles starten:     ./run.sh"
      exit 1
    fi
    ;;

  "")
    # Normaler Entwicklungsstart: Vite + Netlify Functions zusammen.
    echo "[all] Starte TripStar (Frontend + API)..."
    exec npm run dev
    ;;

  *)
    echo "Verwendung: $0 [--client | --server]"
    echo "  (kein Flag)  Frontend + API zusammen (Standard)"
    echo "  --client     Nur Vite-Frontend, kein API"
    echo "  --server     Nur Netlify Functions (benötigt Netlify CLI)"
    exit 1
    ;;

esac
