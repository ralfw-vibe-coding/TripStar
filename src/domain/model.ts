export type Id = string;

export type BookingStatus = "inbox" | "reviewed";

export type BookingType =
  | "flight"
  | "lodging"
  | "train"
  | "rental_car"
  | "ferry"
  | "event"
  | "other";

export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";

export interface User {
  id: Id;
  email: string;
  shortCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtpChallenge {
  id: Id;
  email: string;
  otp: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  userId: Id;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface DailyAllowance {
  date: string;
  country: string;
  countryAbbr: string;
  dailyAllowanceEuro: number;
  factor: number;
}

export interface Trip {
  id: Id;
  tripNumber: string;
  title: string;
  ownerUserId: Id;
  startDate: string;
  endDate: string;
  places: string;
  sharedWithUserIds: Id[];
  color: string;
  dailyAllowances: DailyAllowance[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface Booking {
  id: Id;
  tripId: Id | null;
  sourceDocumentId: Id | null;
  type: BookingType;
  title: string;
  startAt: string | null;
  endAt: string | null;
  timePoints: BookingTimePoint[];
  fromText: string | null;
  toText: string | null;
  travelers: string[];
  participantUserIds: Id[];
  status: BookingStatus;
  serviceIdentifier: string | null;
  operator: string | null;
  details: string;
  extractedJson: unknown | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BookingTimePoint {
  label: "departure" | "arrival" | "start" | "end" | "check_in" | "check_out";
  localDateTime: string;
  timeZone: string;
  instant: string;
  placeText: string | null;
}

export interface DocumentRecord {
  id: Id;
  tripId: Id | null;
  storageKey: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  sourceType: "upload" | "text_input" | "screenshot" | "email_text" | "email_attachment";
  sourceEmailIngestId: Id | null;
  extractedText: string | null;
  isReceipt: boolean;
  receiptAmount: number | null;
  receiptCurrency: string | null;
  receiptJson: unknown | null;
  processingStatus: ProcessingStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ActivityLogEntry {
  id: Id;
  timestamp: string;
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  documentName: string | null;
  details: unknown | null;
}

export type AnalysisJobStatus = "queued" | "running" | "done" | "failed";

export type AnalysisJobSourceType = "text" | "screenshot" | "pdf";

export interface AnalysisJob {
  id: Id;
  status: AnalysisJobStatus;
  sourceType: AnalysisJobSourceType;
  documentName: string;
  tripId: Id | null;
  currentUserId: Id;
  bookingCount: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface IngestPartDocument {
  data: string;
  filename: string;
  mimeType: string;
}

export interface IngestPart {
  txId: string;
  part: number;
  of: number;
  sender: string;
  document: IngestPartDocument;
}

export interface CalendarBooking extends Booking {
  trip: Pick<Trip, "id" | "tripNumber" | "title" | "color"> | null;
}

export interface CalendarView {
  generatedAt: string;
  bookings: CalendarBooking[];
  trips: Trip[];
  users: User[];
}
