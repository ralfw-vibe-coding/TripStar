import type {
  ActivityLogEntry,
  AuthSession,
  Booking,
  CalendarBooking,
  CalendarView,
  DocumentRecord,
  Id,
  OtpChallenge,
  Trip,
  User,
} from "../../model";
import type {
  CreateTripInput,
  CreateBookingInput,
  CreateDocumentInput,
  RequestOtpResult,
  TripStarStateProvider,
  UpdateUserProfileInput,
  UpdateBookingInput,
  UpdateTripInput,
  VerifyOtpResult,
} from "../state-provider";
import { createId } from "./id";
import { seedBookings, seedDocuments, seedTrips, seedUsers } from "./seed";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, randomInt, randomUUID } from "node:crypto";

interface LocalStateProviderOptions {
  users?: User[];
  trips?: Trip[];
  bookings?: Booking[];
  documents?: DocumentRecord[];
  activity?: ActivityLogEntry[];
  otpChallenges?: OtpChallenge[];
  authSessions?: AuthSession[];
  initialTripNumber?: number;
  now?: () => Date;
  stateFilePath?: string;
}

interface PersistedLocalState {
  users: User[];
  trips: Trip[];
  bookings: Booking[];
  documents: DocumentRecord[];
  activity: ActivityLogEntry[];
  otpChallenges?: OtpChallenge[];
  authSessions?: AuthSession[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isoDate(date: Date): string {
  return date.toISOString();
}

export class LocalStateProvider implements TripStarStateProvider {
  private users: User[];
  private trips: Trip[];
  private bookings: Booking[];
  private documents: DocumentRecord[];
  private activity: ActivityLogEntry[] = [];
  private otpChallenges: OtpChallenge[] = [];
  private authSessions: AuthSession[] = [];
  private now: () => Date;
  private stateFilePath: string | null;
  private initialTripNumber: number;

  constructor(options: LocalStateProviderOptions = {}) {
    const persisted = options.stateFilePath ? this.readPersistedState(options.stateFilePath) : null;
    this.users = clone(options.users ?? persisted?.users ?? seedUsers);
    this.trips = this.normalizeTrips(clone(options.trips ?? persisted?.trips ?? seedTrips));
    this.bookings = this.normalizeBookings(clone(options.bookings ?? persisted?.bookings ?? seedBookings));
    this.documents = clone(options.documents ?? persisted?.documents ?? seedDocuments);
    this.activity = clone(options.activity ?? persisted?.activity ?? []);
    this.otpChallenges = clone(options.otpChallenges ?? persisted?.otpChallenges ?? []);
    this.authSessions = clone(options.authSessions ?? persisted?.authSessions ?? []);
    this.now = options.now ?? (() => new Date());
    this.stateFilePath = options.stateFilePath ?? null;
    this.initialTripNumber = options.initialTripNumber ?? 200;
  }

  async listUsers(): Promise<User[]> {
    return clone(this.users);
  }

  async updateUserProfile(userId: Id, input: UpdateUserProfileInput): Promise<User> {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.shortCode = normalizeUserShortCode(input.shortCode);
    user.updatedAt = isoDate(this.now());
    await this.appendActivity({
      level: "info",
      scope: "profile",
      message: "Updated user profile",
      documentName: null,
      details: { userId },
    });
    this.persist();
    return clone(user);
  }

  async requestLoginOtp(emailInput: string): Promise<RequestOtpResult> {
    const email = normalizeEmail(emailInput);
    const timestamp = this.now();
    const expiresAt = new Date(timestamp.getTime() + 5 * 60 * 1000).toISOString();
    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challenge: OtpChallenge = {
      id: createId("otp"),
      email,
      otp,
      expiresAt,
      consumedAt: null,
      createdAt: timestamp.toISOString(),
    };

    this.otpChallenges.push(challenge);
    await this.appendActivity({
      level: "info",
      scope: "auth",
      message: "Requested login OTP",
      documentName: null,
      details: { email },
    });
    this.persist();
    return { email, expiresAt, devOtp: otp };
  }

  async verifyLoginOtp(emailInput: string, otp: string): Promise<VerifyOtpResult> {
    const email = normalizeEmail(emailInput);
    const now = this.now();
    const challenge = [...this.otpChallenges]
      .reverse()
      .find((candidate) => candidate.email === email && candidate.consumedAt === null);

    if (!challenge || challenge.otp !== otp.trim() || new Date(challenge.expiresAt) < now) {
      throw new Error("Invalid or expired OTP.");
    }

    challenge.consumedAt = now.toISOString();
    const user = this.findOrCreateUser(email, now);
    const session: AuthSession = {
      token: this.createSessionToken(),
      userId: user.id,
      expiresAt: new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now.toISOString(),
      revokedAt: null,
    };

    this.authSessions.push(session);
    await this.appendActivity({
      level: "info",
      scope: "auth",
      message: "Verified login OTP",
      documentName: null,
      details: { userId: user.id },
    });
    this.persist();
    return { user: clone(user), session: clone(session) };
  }

  async getAuthSession(token: string): Promise<VerifyOtpResult | null> {
    const session = this.authSessions.find(
      (candidate) => candidate.token === token && candidate.revokedAt === null && new Date(candidate.expiresAt) >= this.now(),
    );
    if (!session) {
      return null;
    }

    const user = this.users.find((candidate) => candidate.id === session.userId);
    if (!user) {
      return null;
    }

    return { user: clone(user), session: clone(session) };
  }

  async revokeAuthSession(token: string): Promise<void> {
    const session = this.authSessions.find((candidate) => candidate.token === token && candidate.revokedAt === null);
    if (session) {
      session.revokedAt = isoDate(this.now());
      this.persist();
    }
  }

  async listTrips(): Promise<Trip[]> {
    return clone(
      this.trips
        .filter((trip) => trip.archivedAt === null)
        .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.tripNumber.localeCompare(right.tripNumber)),
    );
  }

  async createTrip(input: CreateTripInput): Promise<Trip> {
    const timestamp = isoDate(this.now());
    const tripNumber = this.nextTripNumber();
    const title = input.title.trim() || `#${tripNumber}`;
    const trip: Trip = {
      id: `trip_${tripNumber}`,
      tripNumber,
      shortCode: this.normalizeShortCode(input.shortCode ?? title),
      title,
      ownerUserId: input.ownerUserId,
      startDate: input.startDate,
      endDate: input.endDate,
      places: input.places,
      sharedWithUserIds: [...new Set(input.sharedWithUserIds.filter((userId) => userId !== input.ownerUserId))],
      color: input.color ?? "",
      dailyAllowances: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };

    this.trips.push(trip);
    await this.appendActivity({
      level: "info",
      scope: "trip",
      message: `Created trip ${trip.title}`,
      documentName: null,
      details: { tripId: trip.id },
    });
    this.persist();
    return clone(trip);
  }

  async updateTrip(id: Id, input: UpdateTripInput): Promise<Trip> {
    const trip = this.requireTrip(id);
    Object.assign(trip, input, { updatedAt: isoDate(this.now()) });
    await this.appendActivity({
      level: "info",
      scope: "trip",
      message: `Updated trip ${trip.title}`,
      documentName: null,
      details: { tripId: id },
    });
    this.persist();
    return clone(trip);
  }

  async listBookings(): Promise<Booking[]> {
    return clone(this.bookings.filter((booking) => booking.deletedAt === null));
  }

  async createBookings(inputs: CreateBookingInput[]): Promise<Booking[]> {
    const timestamp = isoDate(this.now());
    const bookings = inputs.map<Booking>((input) => ({
      id: `booking_${randomUUID()}`,
      tripId: input.tripId,
      sourceDocumentId: input.sourceDocumentId,
      type: input.type,
      title: input.title,
      startAt: input.startAt,
      endAt: input.endAt,
      fromText: input.fromText,
      toText: input.toText,
      travelers: input.travelers,
      participantUserIds: input.participantUserIds ?? [],
      status: input.status,
      serviceIdentifier: input.serviceIdentifier,
      operator: input.operator,
      details: input.details,
      extractedJson: input.extractedJson,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    }));

    for (const booking of bookings) {
      if (booking.tripId !== null) {
        this.requireTrip(booking.tripId);
      }
      if (booking.sourceDocumentId !== null) {
        this.requireDocument(booking.sourceDocumentId);
      }
    }

    this.bookings.push(...bookings);
    this.persist();
    return clone(bookings);
  }

  async updateBooking(id: Id, input: UpdateBookingInput): Promise<Booking> {
    const booking = this.requireBooking(id);
    Object.assign(booking, input, { updatedAt: isoDate(this.now()) });
    await this.appendActivity({
      level: "info",
      scope: "booking",
      message: `Updated booking ${booking.title}`,
      documentName: null,
      details: { bookingId: id },
    });
    this.persist();
    return clone(booking);
  }

  async assignBookingToTrip(bookingId: Id, tripId: Id | null): Promise<Booking> {
    const booking = this.requireBooking(bookingId);
    if (tripId !== null) {
      this.requireTrip(tripId);
    }
    booking.tripId = tripId;
    booking.updatedAt = isoDate(this.now());
    await this.appendActivity({
      level: "info",
      scope: "booking",
      message: "Assigned booking to trip",
      documentName: null,
      details: { bookingId, tripId },
    });
    this.persist();
    return clone(booking);
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    return clone(this.documents.filter((document) => document.deletedAt === null));
  }

  async createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
    if (input.tripId !== null) {
      this.requireTrip(input.tripId);
    }

    const timestamp = isoDate(this.now());
    const document: DocumentRecord = {
      id: `document_${randomUUID()}`,
      tripId: input.tripId,
      storageKey: input.storageKey,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      sourceType: input.sourceType,
      sourceEmailIngestId: input.sourceEmailIngestId,
      extractedText: input.extractedText,
      isReceipt: input.isReceipt ?? false,
      receiptAmount: input.receiptAmount ?? null,
      receiptCurrency: input.receiptCurrency ?? null,
      receiptJson: input.receiptJson ?? null,
      processingStatus: input.processingStatus,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    this.documents.push(document);
    this.persist();
    return clone(document);
  }

  async assignDocumentToTrip(documentId: Id, tripId: Id | null): Promise<DocumentRecord> {
    const document = this.requireDocument(documentId);
    if (tripId !== null) {
      this.requireTrip(tripId);
    }
    document.tripId = tripId;
    document.updatedAt = isoDate(this.now());
    await this.appendActivity({
      level: "info",
      scope: "document",
      message: "Assigned document to trip",
      documentName: document.originalFileName,
      details: { documentId, tripId },
    });
    this.persist();
    return clone(document);
  }

  async appendActivity(entry: Omit<ActivityLogEntry, "id" | "timestamp">): Promise<ActivityLogEntry> {
    const activity: ActivityLogEntry = {
      ...entry,
      id: createId("act"),
      timestamp: isoDate(this.now()),
    };
    this.activity.unshift(activity);
    this.persist();
    return clone(activity);
  }

  async listActivity(): Promise<ActivityLogEntry[]> {
    return clone(this.activity);
  }

  async getCalendarView(now: Date = this.now()): Promise<CalendarView> {
    const trips = await this.listTrips();
    const tripById = new Map(trips.map((trip) => [trip.id, trip]));
    const bookings = (await this.listBookings())
      .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""))
      .map<CalendarBooking>((booking) => {
        const trip = booking.tripId ? tripById.get(booking.tripId) ?? null : null;
        return {
          ...booking,
          trip: trip
            ? {
                id: trip.id,
                tripNumber: trip.tripNumber,
                shortCode: trip.shortCode,
                title: trip.title,
                color: trip.color,
              }
            : null,
        };
      });

    return {
      generatedAt: isoDate(now),
      bookings,
      trips,
      users: await this.listUsers(),
    };
  }

  private requireTrip(id: Id): Trip {
    const trip = this.trips.find((candidate) => candidate.id === id && candidate.archivedAt === null);
    if (!trip) {
      throw new Error(`Trip not found: ${id}`);
    }
    return trip;
  }

  private requireBooking(id: Id): Booking {
    const booking = this.bookings.find((candidate) => candidate.id === id && candidate.deletedAt === null);
    if (!booking) {
      throw new Error(`Booking not found: ${id}`);
    }
    return booking;
  }

  private requireDocument(id: Id): DocumentRecord {
    const document = this.documents.find((candidate) => candidate.id === id && candidate.deletedAt === null);
    if (!document) {
      throw new Error(`Document not found: ${id}`);
    }
    return document;
  }

  private nextTripNumber(): string {
    const numbers = this.trips
      .map((trip) => Number.parseInt(trip.tripNumber, 10))
      .filter((number) => Number.isFinite(number));
    const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : this.initialTripNumber;
    return String(nextNumber).padStart(3, "0");
  }

  private normalizeShortCode(shortCode: string): string {
    const letters = shortCode.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toUpperCase();
    return letters || "TRP";
  }

  private startOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private readPersistedState(stateFilePath: string): PersistedLocalState | null {
    if (!existsSync(stateFilePath)) {
      return null;
    }

    return JSON.parse(readFileSync(stateFilePath, "utf8")) as PersistedLocalState;
  }

  private normalizeTrips(trips: Trip[]): Trip[] {
    const tripNumberCounts = new Map<string, number>();
    for (const trip of trips) {
      tripNumberCounts.set(trip.tripNumber, (tripNumberCounts.get(trip.tripNumber) ?? 0) + 1);
    }

    const byTripNumber = new Map<string, Trip>();
    for (const trip of trips) {
      const shouldNormalizeId = /^trip_\d{4}$/.test(trip.id) || (tripNumberCounts.get(trip.tripNumber) ?? 0) > 1;
      byTripNumber.set(trip.tripNumber, {
        ...trip,
        id: shouldNormalizeId ? `trip_${trip.tripNumber}` : trip.id,
      });
    }

    return [...byTripNumber.values()];
  }

  private normalizeBookings(bookings: Booking[]): Booking[] {
    return bookings.map((booking) => ({
      ...booking,
      participantUserIds: booking.participantUserIds ?? [],
    }));
  }

  private persist(): void {
    if (!this.stateFilePath) {
      return;
    }

    const stateDir = dirname(this.stateFilePath);
    mkdirSync(stateDir, { recursive: true });
    this.backupCurrentState();
    writeFileSync(
      this.stateFilePath,
      JSON.stringify(
        {
          users: this.users,
          trips: this.trips,
          bookings: this.bookings,
          documents: this.documents,
          activity: this.activity,
          otpChallenges: this.otpChallenges,
          authSessions: this.authSessions,
        },
        null,
        2,
      ),
    );
  }

  private backupCurrentState(): void {
    if (!this.stateFilePath || !existsSync(this.stateFilePath)) {
      return;
    }

    const backupDir = join(dirname(dirname(this.stateFilePath)), "backups");
    mkdirSync(backupDir, { recursive: true });
    const timestamp = this.now().toISOString().replace(/[:.]/g, "-");
    copyFileSync(this.stateFilePath, join(backupDir, `tripstar-state.${timestamp}.json`));
  }

  private findOrCreateUser(email: string, now: Date): User {
    const existingUser = this.users.find((candidate) => candidate.email === email);
    if (existingUser) {
      return existingUser;
    }

    const timestamp = now.toISOString();
    const user: User = {
      id: `user_${randomUUID()}`,
      email,
      shortCode: userShortCode(email),
      displayName: email.split("@")[0] || email,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.users.push(user);
    return user;
  }

  private createSessionToken(): string {
    return randomBytes(32).toString("base64url");
  }
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("A valid email address is required.");
  }
  return normalized;
}

function userShortCode(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  return normalizeUserShortCode(localPart);
}

function normalizeUserShortCode(shortCode: string): string {
  const letters = shortCode.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase();
  if (!letters) {
    throw new Error("Profile code is required.");
  }
  return letters;
}
