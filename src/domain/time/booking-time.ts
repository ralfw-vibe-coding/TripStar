import type { BookingTimePoint } from "../model";
import type { AirportExtraction } from "../extraction/booking-extraction";

const airportTimeZones: Record<string, string> = {
  BER: "Europe/Berlin",
  DAD: "Asia/Ho_Chi_Minh",
  FRA: "Europe/Berlin",
  HAM: "Europe/Berlin",
  KTI: "Asia/Phnom_Penh",
  LHR: "Europe/London",
  LGW: "Europe/London",
  LCY: "Europe/London",
  LTN: "Europe/London",
  PNH: "Asia/Phnom_Penh",
  SGN: "Asia/Ho_Chi_Minh",
  SOF: "Europe/Sofia",
  ZRH: "Europe/Zurich",
};

const cityTimeZones: Record<string, string> = {
  berlin: "Europe/Berlin",
  da_nang: "Asia/Ho_Chi_Minh",
  frankfurt: "Europe/Berlin",
  hamburg: "Europe/Berlin",
  ho_chi_minh: "Asia/Ho_Chi_Minh",
  london: "Europe/London",
  phnom_penh: "Asia/Phnom_Penh",
  sofia: "Europe/Sofia",
  zurich: "Europe/Zurich",
  zürich: "Europe/Zurich",
};

export function airportTimeZone(airport: AirportExtraction): string | null {
  if (airport.code) {
    const timeZone = airportTimeZones[airport.code.toUpperCase()];
    if (timeZone) return timeZone;
  }
  const candidates = [airport.city, airport.name].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const normalized = normalizePlaceKey(candidate);
    for (const [city, timeZone] of Object.entries(cityTimeZones)) {
      if (normalized.includes(city)) return timeZone;
    }
  }
  return null;
}

export function createBookingTimePoint(input: {
  label: BookingTimePoint["label"];
  localDateTime: string | null;
  timeZone: string | null;
  placeText: string | null;
  currentYear: number;
}): BookingTimePoint | null {
  const localDateTime = normalizeLocalDateTime(input.localDateTime, input.currentYear);
  if (!localDateTime || !input.timeZone) return null;
  return {
    label: input.label,
    localDateTime,
    timeZone: input.timeZone,
    instant: localDateTimeToInstant(localDateTime, input.timeZone),
    placeText: input.placeText,
  };
}

export function normalizeLocalDateTime(value: string | null, currentYear: number): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const germanDate = /^(\d{1,2})\.(\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2}))?$/.exec(trimmed);
  if (germanDate) {
    const [, day, month, hour = "0", minute = "0"] = germanDate;
    return localDateTimeString(currentYear, Number(month), Number(day), Number(hour), Number(minute));
  }

  const isoLike = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/.exec(trimmed);
  if (isoLike) {
    const [, year, month, day, hour = "0", minute = "0"] = isoLike;
    return localDateTimeString(Number(year), Number(month), Number(day), Number(hour), Number(minute));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = /\b\d{4}\b/.test(trimmed) ? parsed.getFullYear() : currentYear;
  return localDateTimeString(year, parsed.getMonth() + 1, parsed.getDate(), parsed.getHours(), parsed.getMinutes());
}

export function localDateTimeToInstant(localDateTime: string, timeZone: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localDateTime);
  if (!parts) throw new Error(`Invalid local date/time: ${localDateTime}`);
  const [, year, month, day, hour, minute] = parts;
  const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const offset = timeZoneOffsetMs(new Date(localAsUtc), timeZone);
  return new Date(localAsUtc - offset).toISOString();
}

export function formatTimePointLocal(point: BookingTimePoint): string {
  const date = new Date(`${point.localDateTime}:00`);
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return zonedAsUtc - date.getTime();
}

function localDateTimeString(year: number, month: number, day: number, hour: number, minute: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
}

function normalizePlaceKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
