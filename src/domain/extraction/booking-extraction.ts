import type { Booking } from "../model";
import type { AnalyzedBookingInput } from "../providers/booking-analysis-provider";
import { airportTimeZone, createBookingTimePoint } from "../time/booking-time";

export interface ExtractionEvidence {
  field: string;
  value: string;
  sourceText: string;
  page: number | null;
}

export interface AirportExtraction {
  code: string | null;
  name: string | null;
  city: string | null;
  terminal: string | null;
  gate: string | null;
}

export interface FlightExtraction {
  flightNumber: string | null;
  airline: string | null;
  airlineCode: string | null;
  departure: AirportExtraction;
  arrival: AirportExtraction;
  departureAtLocal: string | null;
  arrivalAtLocal: string | null;
  boardingAtLocal: string | null;
  departureTimeZone: string | null;
  arrivalTimeZone: string | null;
  bookingReference: string | null;
  ticketNumber: string | null;
  passengers: string[];
  seats: string[];
  cabinClass: string | null;
  baggage: string | null;
}

export interface TrainExtraction {
  trainNumber: string | null;
  operator: string | null;
  fromStation: string | null;
  toStation: string | null;
  departureAtLocal: string | null;
  arrivalAtLocal: string | null;
  departureTimeZone: string | null;
  arrivalTimeZone: string | null;
  bookingReference: string | null;
  passengers: string[];
  seats: string[];
}

export interface LodgingExtraction {
  propertyName: string | null;
  address: string | null;
  city: string | null;
  checkInAtLocal: string | null;
  checkOutAtLocal: string | null;
  timeZone: string | null;
  bookingReference: string | null;
  guests: string[];
  phone: string | null;
  cancellationDeadlineAtLocal: string | null;
}

export interface GenericTypedExtraction {
  providerName: string | null;
  serviceIdentifier: string | null;
  fromText: string | null;
  toText: string | null;
  startAtLocal: string | null;
  endAtLocal: string | null;
  startTimeZone: string | null;
  endTimeZone: string | null;
  people: string[];
}

export interface ExtractedBooking {
  type: Booking["type"];
  summary: string;
  flight: FlightExtraction | null;
  train: TrainExtraction | null;
  lodging: LodgingExtraction | null;
  rentalCar: GenericTypedExtraction | null;
  ferry: GenericTypedExtraction | null;
  event: GenericTypedExtraction | null;
  other: GenericTypedExtraction | null;
  importantDetails: string[];
  evidence: ExtractionEvidence[];
  warnings: string[];
  confidence: number;
}

export function projectExtractedBooking(
  extracted: ExtractedBooking,
  options: { currentYear: number; normalizeDateTime: (value: string | null, currentYear: number, timeZone?: string | null) => string | null },
): AnalyzedBookingInput {
  const normalized = normalizeExtractedBooking(extracted);
  const projection = projectionFor(normalized, options);
  return {
    type: normalized.type,
    title: projection.title,
    startAt: projection.startAt,
    endAt: projection.endAt,
    timePoints: projection.timePoints,
    fromText: projection.fromText,
    toText: projection.toText,
    travelers: projection.travelers,
    serviceIdentifier: projection.serviceIdentifier,
    operator: projection.operator,
    details: detailTextFor(normalized),
    extractedJson: normalized,
  };
}

function projectionFor(
  extracted: ExtractedBooking,
  options: { currentYear: number; normalizeDateTime: (value: string | null, currentYear: number, timeZone?: string | null) => string | null },
): Omit<AnalyzedBookingInput, "type" | "details" | "extractedJson"> {
  if (extracted.type === "flight" && extracted.flight) {
    const flight = extracted.flight;
    const routeTitle = compact([airportShortLabel(flight.departure), airportShortLabel(flight.arrival)]).join(" -> ");
    const departureTimeZone = flight.departureTimeZone ?? airportTimeZone(flight.departure);
    const arrivalTimeZone = flight.arrivalTimeZone ?? airportTimeZone(flight.arrival);
    const fromText = airportConciseLabel(flight.departure);
    const toText = airportConciseLabel(flight.arrival);
    const departure = createBookingTimePoint({
      label: "departure",
      localDateTime: flight.departureAtLocal,
      timeZone: departureTimeZone,
      placeText: fromText,
      currentYear: options.currentYear,
    });
    const arrival = createBookingTimePoint({
      label: "arrival",
      localDateTime: flight.arrivalAtLocal,
      timeZone: arrivalTimeZone,
      placeText: toText,
      currentYear: options.currentYear,
    });
    return {
      title: routeTitle || extracted.summary || "Flight",
      startAt: departure?.instant ?? options.normalizeDateTime(flight.departureAtLocal, options.currentYear, departureTimeZone),
      endAt: arrival?.instant ?? options.normalizeDateTime(flight.arrivalAtLocal, options.currentYear, arrivalTimeZone),
      timePoints: compactTimePoints([departure, arrival]),
      fromText,
      toText,
      travelers: flight.passengers,
      serviceIdentifier: flight.flightNumber,
      operator: flight.airline,
    };
  }

  if (extracted.type === "train" && extracted.train) {
    const train = extracted.train;
    const routeTitle = compact([train.fromStation, train.toStation]).join(" -> ");
    const departureTimeZone = train.departureTimeZone ?? null;
    const arrivalTimeZone = train.arrivalTimeZone ?? null;
    const departure = createBookingTimePoint({
      label: "departure",
      localDateTime: train.departureAtLocal,
      timeZone: departureTimeZone,
      placeText: train.fromStation,
      currentYear: options.currentYear,
    });
    const arrival = createBookingTimePoint({
      label: "arrival",
      localDateTime: train.arrivalAtLocal,
      timeZone: arrivalTimeZone,
      placeText: train.toStation,
      currentYear: options.currentYear,
    });
    return {
      title: routeTitle || extracted.summary || "Train",
      startAt: departure?.instant ?? options.normalizeDateTime(train.departureAtLocal, options.currentYear, departureTimeZone),
      endAt: arrival?.instant ?? options.normalizeDateTime(train.arrivalAtLocal, options.currentYear, arrivalTimeZone),
      timePoints: compactTimePoints([departure, arrival]),
      fromText: train.fromStation,
      toText: train.toStation,
      travelers: train.passengers,
      serviceIdentifier: train.trainNumber,
      operator: train.operator,
    };
  }

  if (extracted.type === "lodging" && extracted.lodging) {
    const lodging = extracted.lodging;
    const timeZone = lodging.timeZone ?? null;
    const placeText = lodging.city ?? lodging.address;
    const checkIn = createBookingTimePoint({
      label: "check_in",
      localDateTime: lodging.checkInAtLocal,
      timeZone,
      placeText,
      currentYear: options.currentYear,
    });
    const checkOut = createBookingTimePoint({
      label: "check_out",
      localDateTime: lodging.checkOutAtLocal,
      timeZone,
      placeText,
      currentYear: options.currentYear,
    });
    return {
      title: lodging.propertyName ?? extracted.summary ?? "Lodging",
      startAt: checkIn?.instant ?? options.normalizeDateTime(lodging.checkInAtLocal, options.currentYear, timeZone),
      endAt: checkOut?.instant ?? options.normalizeDateTime(lodging.checkOutAtLocal, options.currentYear, timeZone),
      timePoints: compactTimePoints([checkIn, checkOut]),
      fromText: lodging.address,
      toText: lodging.city,
      travelers: lodging.guests,
      serviceIdentifier: lodging.bookingReference,
      operator: lodging.propertyName,
    };
  }

  const generic = extracted.rentalCar ?? extracted.ferry ?? extracted.event ?? extracted.other;
  const startTimeZone = generic?.startTimeZone ?? null;
  const endTimeZone = generic?.endTimeZone ?? null;
  const start = createBookingTimePoint({
    label: "start",
    localDateTime: generic?.startAtLocal ?? null,
    timeZone: startTimeZone,
    placeText: generic?.fromText ?? null,
    currentYear: options.currentYear,
  });
  const end = createBookingTimePoint({
    label: "end",
    localDateTime: generic?.endAtLocal ?? null,
    timeZone: endTimeZone,
    placeText: generic?.toText ?? null,
    currentYear: options.currentYear,
  });
  return {
    title: extracted.summary || titleForType(extracted.type),
    startAt: start?.instant ?? options.normalizeDateTime(generic?.startAtLocal ?? null, options.currentYear, startTimeZone),
    endAt: end?.instant ?? options.normalizeDateTime(generic?.endAtLocal ?? null, options.currentYear, endTimeZone),
    timePoints: compactTimePoints([start, end]),
    fromText: generic?.fromText ?? null,
    toText: generic?.toText ?? null,
    travelers: generic?.people ?? [],
    serviceIdentifier: generic?.serviceIdentifier ?? null,
    operator: generic?.providerName ?? null,
  };
}

function compactTimePoints<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => Boolean(value));
}

function normalizeExtractedBooking(extracted: ExtractedBooking): ExtractedBooking {
  return {
    ...extracted,
    summary: extracted.summary?.trim() || titleForType(extracted.type),
    importantDetails: extracted.importantDetails ?? [],
    evidence: extracted.evidence ?? [],
    warnings: extracted.warnings ?? [],
    confidence: Number.isFinite(extracted.confidence) ? Math.max(0, Math.min(1, extracted.confidence)) : 0,
  };
}

function detailTextFor(extracted: ExtractedBooking): string {
  const lines = [extracted.summary, ...detailLinesForType(extracted), ...extracted.importantDetails];
  if (extracted.warnings.length > 0) {
    lines.push(`Warnings: ${extracted.warnings.join("; ")}`);
  }
  return compact(lines).join("\n");
}

function detailLinesForType(extracted: ExtractedBooking): string[] {
  if (extracted.type === "flight" && extracted.flight) {
    const flight = extracted.flight;
    return compact([
      labeled("Departure", airportFullLabel(flight.departure)),
      labeled("Arrival", airportFullLabel(flight.arrival)),
      labeled("Booking reference", flight.bookingReference),
      labeled("Ticket number", flight.ticketNumber),
      labeled("Boarding", flight.boardingAtLocal),
      labeled("Seats", flight.seats.join(", ")),
      labeled("Cabin", flight.cabinClass),
      labeled("Baggage", flight.baggage),
    ]);
  }
  if (extracted.type === "train" && extracted.train) {
    const train = extracted.train;
    return compact([labeled("Booking reference", train.bookingReference), labeled("Seats", train.seats.join(", "))]);
  }
  if (extracted.type === "lodging" && extracted.lodging) {
    const lodging = extracted.lodging;
    return compact([
      labeled("Address", lodging.address),
      labeled("Phone", lodging.phone),
      labeled("Cancellation deadline", lodging.cancellationDeadlineAtLocal),
    ]);
  }
  return [];
}

function airportShortLabel(airport: AirportExtraction): string | null {
  return airport.code ?? airport.city ?? airport.name;
}

function airportConciseLabel(airport: AirportExtraction): string | null {
  const shortLabel = airportShortLabel(airport);
  if (!shortLabel) return null;
  if (!airport.code || !airport.city) return shortLabel;
  return `${airport.code} · ${airport.city}`;
}

function airportFullLabel(airport: AirportExtraction): string | null {
  const place = placeName(airport);
  const code = airport.code ? `${airport.code}${place ? ` · ${place}` : ""}` : place;
  const terminal = airport.terminal ? `Terminal ${airport.terminal}` : null;
  const gate = airport.gate ? `Gate ${airport.gate}` : null;
  return compact([code, terminal, gate]).join(", ") || null;
}

function placeName(airport: AirportExtraction): string | null {
  if (airport.city && airport.name && airport.name.toLowerCase().includes(airport.city.toLowerCase())) {
    return airport.name;
  }
  return compact([airport.city, airport.name]).join(" ") || null;
}

function titleForType(type: Booking["type"]): string {
  return type.replace(/_/g, " ");
}

function labeled(label: string, value: string | null): string | null {
  return value?.trim() ? `${label}: ${value}` : null;
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim() ?? "").filter(Boolean);
}
