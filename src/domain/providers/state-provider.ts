import type { ActivityLogEntry, AnalysisJob, AuthSession, Booking, CalendarView, DocumentRecord, Id, IngestPart, Trip, User } from "../model";

export interface CreateTripInput {
  title: string;
  ownerUserId: Id;
  startDate: string;
  endDate: string;
  places: string;
  sharedWithUserIds: Id[];
  color?: string;
}

export interface UpdateTripInput {
  title?: string;
  startDate?: string;
  endDate?: string;
  places?: string;
  sharedWithUserIds?: Id[];
  color?: string;
}

export interface UpdateBookingInput {
  title?: string;
  type?: Booking["type"];
  startAt?: string | null;
  endAt?: string | null;
  timePoints?: Booking["timePoints"];
  fromText?: string | null;
  toText?: string | null;
  travelers?: string[];
  participantUserIds?: Id[];
  status?: Booking["status"];
  serviceIdentifier?: string | null;
  operator?: string | null;
  details?: string;
}

export interface CreateDocumentInput {
  tripId: Id | null;
  storageKey: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  sourceType: DocumentRecord["sourceType"];
  sourceEmailIngestId: Id | null;
  extractedText: string | null;
  isReceipt?: boolean;
  receiptAmount?: number | null;
  receiptCurrency?: string | null;
  receiptJson?: unknown | null;
  processingStatus: DocumentRecord["processingStatus"];
}

export interface CreateBookingInput {
  tripId: Id | null;
  sourceDocumentId: Id | null;
  type: Booking["type"];
  title: string;
  startAt: string | null;
  endAt: string | null;
  timePoints?: Booking["timePoints"];
  fromText: string | null;
  toText: string | null;
  travelers: string[];
  participantUserIds?: Id[];
  status: Booking["status"];
  serviceIdentifier: string | null;
  operator: string | null;
  details: string;
  extractedJson: unknown | null;
}

export interface CreateAnalysisJobInput {
  sourceType: AnalysisJob["sourceType"];
  documentName: string;
  tripId: Id | null;
  currentUserId: Id;
}

export interface UpdateAnalysisJobInput {
  status?: AnalysisJob["status"];
  bookingCount?: number | null;
  error?: string | null;
  completedAt?: string | null;
}

export interface RequestOtpResult {
  email: string;
  expiresAt: string;
  devOtp?: string;
}

export interface VerifyOtpResult {
  user: User;
  session: AuthSession;
}

export interface UpdateUserProfileInput {
  shortCode: string;
}

export interface TripStarStateProvider {
  listUsers(): Promise<User[]>;
  updateUserProfile(userId: Id, input: UpdateUserProfileInput): Promise<User>;
  requestLoginOtp(email: string): Promise<RequestOtpResult>;
  verifyLoginOtp(email: string, otp: string): Promise<VerifyOtpResult>;
  getAuthSession(token: string): Promise<VerifyOtpResult | null>;
  revokeAuthSession(token: string): Promise<void>;

  listTrips(): Promise<Trip[]>;
  createTrip(input: CreateTripInput): Promise<Trip>;
  updateTrip(id: Id, input: UpdateTripInput): Promise<Trip>;

  listBookings(): Promise<Booking[]>;
  createBookings(input: CreateBookingInput[]): Promise<Booking[]>;
  updateBooking(id: Id, input: UpdateBookingInput): Promise<Booking>;
  assignBookingToTrip(bookingId: Id, tripId: Id | null): Promise<Booking>;
  deleteBooking(id: Id): Promise<Booking>;

  listDocuments(): Promise<DocumentRecord[]>;
  createDocument(input: CreateDocumentInput): Promise<DocumentRecord>;
  assignDocumentToTrip(documentId: Id, tripId: Id | null): Promise<DocumentRecord>;
  deleteDocument(id: Id): Promise<DocumentRecord>;

  listAnalysisJobs(): Promise<AnalysisJob[]>;
  createAnalysisJob(input: CreateAnalysisJobInput): Promise<AnalysisJob>;
  updateAnalysisJob(id: Id, input: UpdateAnalysisJobInput): Promise<AnalysisJob>;

  appendActivity(entry: Omit<ActivityLogEntry, "id" | "timestamp" | "userId">): Promise<ActivityLogEntry>; // userId injected via AsyncLocalStorage
  listActivity(userId: string): Promise<ActivityLogEntry[]>;

  getCalendarView(userId: string, now?: Date): Promise<CalendarView>;

  findUserByEmail(email: string): Promise<User | null>;
  findDocumentByEmailMessageId(messageId: string): Promise<DocumentRecord | null>;
  storeIngestPart(part: IngestPart): Promise<void>;
  getIngestParts(txId: string): Promise<IngestPart[]>;
  deleteIngestParts(txId: string): Promise<void>;
  purgeStaleIngestParts(olderThanMinutes: number): Promise<number>;
}
