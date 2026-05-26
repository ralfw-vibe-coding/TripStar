# TripStar - Briefing

Dieses Briefing ist ein Startpunkt fuer ein neues Repo. Es beschreibt nicht die Migration der bestehenden TripCal-App, sondern die Erkenntnisse, die in eine neue Implementierung uebernommen werden sollten.

## Zielbild

TripStar ist die v2 der Anwendung TripCal. Das ist eine persoenliche Web-App fuer Reiseplanung und Reisereports. Sie wird von wenigen bekannten Personen genutzt und soll Dokumente, Buchungen, Trips und Reportdaten verwalten.

Die Anwendung verfolgt eine API-first-Strategie:

- Das visuelle Frontend ruft ausschliesslich Backend-APIs auf.
- n8n ruft ebenfalls Backend-APIs auf, vor allem fuer Email-Ingest.
- API-Endpunkte sollen stabil bleiben, auch wenn sich Frontend oder interne Verarbeitung aendern.
- Das Backend ist die fachliche Mitte der Anwendung.

Der Stack bleibt pragmatisch:

- TypeScript / Node.js
- React / Vite UI, Lucide Icons
- Netlify fuer Deployment und API Functions
- Neon Postgres fuer Current-State-Daten
- Cloudflare R2 fuer Dateien
- n8n fuer Email-Empfang und Weiterleitung an die API
- OpenAI fuer Text-, Dokument- und Buchungsextraktion

## Wichtige Entscheidung: Kein Event Sourcing

TripCal v1 hat Event Sourcing verwendet. Das war fachlich nicht falsch, wurde aber fuer diese Domaene zu schwer:

- Viele kleine Korrekturen fuehrten zu vielen Eventtypen.
- UI-Updates mussten ueber Projektionen laufen.
- Zwischenzustaende wie Email-Parts, Kandidaten, Korrekturen und Statuswechsel wurden komplex.
- Einfache Aenderungen wie "Booking bearbeiten" oder "Trip zuordnen" waren aufwendiger als noetig.

TripCal v2 soll stattdessen eine Current-State-Datenbank verwenden:

- Aktueller Zustand steht direkt in Tabellen.
- Aenderungen sind normale Inserts, Updates, Upserts oder Soft Deletes.
- Ein separates Activity Log bleibt fuer Nachvollziehbarkeit und Debugging erhalten.
- KI-Rohdaten und flexible Details koennen als JSONB gespeichert werden.

## Architektur

Die Architektur besteht aus Schalen:

1. **Domain State Provider**
   - Zugriff auf den aktuellen Anwendungszustand.
   - Production: Postgres.
   - Tests/lokal: In-Memory und/oder File system

2. **RPUs**
   - Request Processing Units.
   - Eine RPU verarbeitet genau einen Domain Request.
   - Commands veraendern Zustand und liefern nur Status/Meta.
   - Queries lesen Zustand und liefern Datenmodelle.
   - RPUs kennen keine HTTP-Details, kein React, kein Netlify.
   - RPUs duerfen Domain State Provider nutzen.

3. **Reactors**
   - Orchestrieren mehrere RPUs und Environment Provider fuer eine Backend-Interaktion.
   - Beispiel: Email ingest, Dokument hochladen, KI-Extraktion, Booking speichern.
   - Reactors entsprechen praktisch den v1-Slices, aber ohne Event-Sourcing-Zwang.

4. **Portale**
   - HTTP/API-Endpunkte.
   - Uebersetzen Client Requests in Reactor- oder RPU-Aufrufe.
   - Wissen als einzige Schicht, dass HTTP/Netlify verwendet wird.

5. **Environment Provider**
   - Kapseln Technologien für den Zugriff auf Uhrzeit, Zufallszahlen, Web-Ressourcen, Datenbanken, Dateisystem

### Teststrategie

Alle Module, die keine Frontend-Technologien enthalten, sollten durch automatisierte Tests abgedeckt werden.

Ggf. können auch Backend-Tests durch den API gemacht werden, um das Backend End-to-End zu testen (mit production providers oder alternativen, leichtgewichtigeren Implementationen).

## Datenmodell

Das Datenmodell soll relational sein, aber JSONB dort nutzen, wo Flexibilitaet sinnvoll ist.

### users

Eine Row pro User.

Moegliche Felder:

```text
id
email
short_code
display_name
created_at
updated_at
```

Signup ist nicht noetig. Anmeldung per Email/OTP.

### trips

Eine Row pro Trip. Trips enthalten nur Kopfdaten und kompakte Reportdaten, die immer tripbezogen geladen werden.

Moegliche Felder:

```text
id
trip_number
short_code
title
owner_user_id
start_date
end_date
color
daily_allowances jsonb
created_at
updated_at
archived_at nullable
```

`daily_allowances` kann als JSONB direkt am Trip gespeichert werden:

```json
[
  {
    "date": "2026-05-01",
    "country": "Germany",
    "countryAbbr": "GER",
    "dailyAllowanceEuro": 56,
    "factor": 2
  }
]
```

Wenn sich die Trip-Zeitspanne aendert, werden diese Eintraege nicht geloescht. Die Report-Ansicht zeigt nur Eintraege, deren Datum aktuell im Trip-Zeitraum liegt.

### bookings

Eine Row pro Buchung.

Moegliche Felder:

```text
id
trip_id nullable
source_document_id nullable
type -- zb Flug, Unterkunft, Mietwagen, Zugfahrt usw.
title
start_at nullable -- Zeit, wann Buchung startet
end_at nullable
from_text nullable -- Ort, wo Buchung startet
to_text nullable
travelers jsonb --
status
service_identifier nullable -- zb Flugnummer
operator nullable -- zb Fluggesellschaft
details text -- Fließtext mit ausführlicher Beschreibung der Buchung entsprechend ihrem Typ
extracted_json jsonb nullable
created_at
updated_at
deleted_at nullable
```

Hinweise:

- Wenn ein Dokument mehrere Buchungen enthaelt, entstehen mehrere Booking-Rows.
- `status` kann zunaechst `inbox` oder `reviewed` sein.
- Loeschen sollte als Soft Delete umgesetzt werden.
- `source_document_id` reicht zunaechst, weil eine Buchung nur ein Quelldokument hat.

### documents

Eine Row pro Dokument. Nicht alle Dokumente eines Trips in einer Row speichern.

Moegliche Felder:

```text
id
trip_id nullable
storage_key nullable
original_file_name nullable
mime_type nullable
source_type
source_email_ingest_id nullable
extracted_text text nullable
is_receipt boolean
receipt_amount numeric nullable
receipt_currency text nullable
receipt_json jsonb nullable
processing_status
created_at
updated_at
deleted_at nullable
```

Hinweise:

- Ein Dokument kann Buchungsbeleg, Zahlungsbeleg oder beides sein.
- Dokumente selbst liegen in R2, nicht in Postgres.
- `trip_id` am Dokument bedeutet: Dieses Dokument ist dem Trip als Report-/Zahlungsbeleg zugeordnet.
- Ein Dokument darf nur einem Trip zugeordnet sein.

### email_ingests

Operatives Protokoll und Idempotenz fuer n8n Email-Ingest. Eine Email wird an das Backend mit ihren Anhängen geschickt. Anhänge sind potenziell speicherwürdige Dokumente. Es wird versucht, aus allem Buchungen zu extrahieren.

Moegliche Felder:

```text
id
original_message_id
part_id
part_index
part_count
from_email
subject
received_at
status
error_message nullable
created_at
updated_at
```

Hinweise:

- n8n kann weiterhin Email-Text und Attachments als einzelne API-Calls senden.
- Jeder Call braucht stabile Part-Metadaten.
- Das Backend muss Idempotenz ueber `original_message_id` + `part_id` sicherstellen.
- Deduplizierung zwischen Email-Text und Attachments kann spaeter ueber Kandidatenlogik erfolgen, muss aber nicht im ersten Durchstich enthalten sein.

### activity_log

Reines Protokoll fuer Diagnose und Betrieb.

Moegliche Felder:

```text
id
timestamp
level
scope
message
document_name nullable
details jsonb
```

Das Activity Log ist nicht Quelle fuer Kalender oder Report. Es dient nur der Nachvollziehbarkeit.

## Dokument- und KI-Verarbeitung

Dokumentverarbeitung sollte als Reactor umgesetzt werden.

Grundfluss fuer Datei-Upload:

```text
API Portal
  -> Reactor: SubmitDocuments
  -> FileStorageProvider speichert Datei in R2
  -> DocumentStateProvider legt document row an
  -> TextExtractionProvider extrahiert Text
  -> BookingExtractionProvider extrahiert Bookings
  -> ReceiptExtractionProvider erkennt Zahlungsbeleg und Gesamtbetrag
  -> BookingStateProvider speichert Booking-Rows
  -> DocumentStateProvider aktualisiert Dokumentstatus und Receipt-Felder
  -> ActivityLogProvider schreibt Protokoll
```

Grundfluss fuer Email-Ingest:

```text
n8n
  -> API Portal: ingest-email
  -> Reactor: IngestEmailPart
  -> EmailIngestStateProvider prueft Idempotenz
  -> je nach Part: Text verarbeiten oder Attachment speichern/extrahieren
  -> Bookings und Dokumentdaten speichern
  -> ActivityLogProvider schreibt Protokoll
```

## Receipt-Erkennung

Zahlungsbelege sollen dokumentzentriert erkannt werden.

Ein Dokument ist relevant fuer TripRep, wenn ein Gesamtbetrag erkannt wurde oder es manuell als Zahlungsbeleg markiert wird.

Die Receipt-Erkennung sollte ein eigener KI-Schritt sein:

- Buchungsextraktion beantwortet: Was findet wann/wo/fuer wen statt?
- Receipt-Erkennung beantwortet: Ist das ein Zahlungsbeleg und welcher Gesamtbetrag zaehlt?

Moegliches Ergebnis:

```json
{
  "isReceipt": true,
  "amount": 148.40,
  "currency": "EUR",
  "confidence": "high",
  "notes": "TOTAL amount used; line items ignored."
}
```

Der Betrag muss die relevante Summe sein, nicht irgendein Einzelbetrag im Dokument.

## API-first Grundsaetze

API-Kontrakte sollten stabil und dokumentiert sein.

Wichtige Endpunkte:

```text
GET  /api/calendar
GET  /api/reports
GET  /api/trips
POST /api/trips
PATCH /api/trips/:id
POST /api/documents
POST /api/ingest-email
PATCH /api/bookings/:id
PATCH /api/bookings/:id/trip
PATCH /api/documents/:id/trip
GET  /api/documents/:id/content
GET  /api/activity-log
```

Der n8n-Endpunkt sollte moeglichst kompatibel zur bestehenden Form bleiben:

- Bearer Token Auth
- Email-Metadaten
- Optional Text
- Optional genau ein Attachment pro Call
- Part-Metadaten fuer Scatter/Gather

## UI-Erkenntnisse aus TripCal v1

Das UI muss nicht komplett uebernommen werden. Screenshots koennen als Vorlage dienen. Folgende UX-Erkenntnisse sind wertvoll:

- Kalender ist Default-Ansicht.
- Dokumenteinreichung startet mit Datei-Dropzone.
- Text/Clipboard ist ein zweiter Eingabemodus.
- Buchungen im Kalender muessen kompakt sein.
- Details muessen aufklappbar sein.
- Reisende als farbige Kuerzelkreise funktionieren gut.
- Buchungstypen mit Lucide Icons funktionieren gut.
- Inbox/Reviewed ist nuetzlich.
- Trip-Zuordnung direkt in der aufgeklappten Buchung ist nuetzlich.
- Originaldokument in Overlay ansehen ist besser als Navigation auf iPhone.
- Vergangene Buchungen sollten default ausgeblendet, aber filterbar sein.
- Reports als zweite Hauptansicht neben Kalender funktionieren gut.
- Report-Tagesraster funktioniert gut.
- Tagespauschalen sollten sofort gespeichert werden, um vergessene Drafts zu vermeiden.

## Was nicht uebernommen werden sollte

- Event Store als primaere Persistenz.
- Projektionen als Hauptweg zum UI-Zustand.
- Korrektur-Events fuer normale Bearbeitungen.
- Zu viele Zwischen-Events fuer Email-Ingest.
- RPU-Code, der nur Events erzeugt, obwohl ein direktes Update einfacher waere.

## Was uebernommen werden kann

- Das grundsaetzliche API-first Denken.
- Provider fuer R2, OpenAI, Text Extraction und Activity Log als Konzepte.
- Das n8n-Konzept: Email empfangen, in API Calls normalisieren, Fehler per Email melden.
- Die OpenAI-Prompts/JSON-Schemas als Ausgangspunkt, aber ueberarbeitet fuer v2.
- Traveller-Mapping ueber konfigurierbare Aliase.
- PDF-only Upload-Regel fuer Dokumente.
- Local/Production Provider-Umschaltung ueber `.env`.
- Activity Log als einfache Betriebsansicht.

## Erster sinnvoller Durchstich fuer v2

Nicht mit dem vollen Report starten. Erst Feature-Paritaet im Kern.

Benutzerverwaltung/Auth soll von vornherein implementiert werden!

1. Postgres-Schema fuer `trips`, `bookings`, `documents`, `activity_log`.
2. API:
   - Trip anlegen/aendern/listen.
   - Dokument hochladen.
   - Bookings extrahieren und speichern.
   - Kalender anzeigen.
3. Frontend:
   - Kalenderansicht.
   - Dokument einreichen.
   - Buchung aufklappen.
   - Buchung bearbeiten.
   - Trip zuordnen.
4. Danach:
   - Report-Ansicht mit Tagesraster.
   - Daily Allowances als JSONB am Trip.
   - Receipt-Erkennung und Dokumente im Report.

## Grundprinzip

TripCal v2 soll nicht versuchen, besonders architektonisch elegant zu sein. Es soll ein robustes persoenliches Arbeitswerkzeug sein:

- API zuerst.
- Current State zuerst.
- Relationale Identitaet und Beziehungen.
- JSONB fuer flexible KI-/Detaildaten.
- Activity Log fuer Nachvollziehbarkeit.
- Keine Erweiterung der Fachlichkeit waehrend des Persistenzumbaus.
