import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type {
  ActivityLogEntry,
  AnalysisJob,
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
  CreateAnalysisJobInput,
  CreateBookingInput,
  CreateDocumentInput,
  CreateTripInput,
  RequestOtpResult,
  TripStarStateProvider,
  UpdateAnalysisJobInput,
  UpdateBookingInput,
  UpdateTripInput,
  UpdateUserProfileInput,
  VerifyOtpResult,
} from "../state-provider";
import { randomBytes, randomInt, randomUUID } from "node:crypto";

type Sql = NeonQueryFunction<false, false>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isoDate(date: Date): string {
  return date.toISOString();
}

export class PostgresStateProvider implements TripStarStateProvider {
  private readonly sql: Sql;
  private readonly ready: Promise<void>;

  constructor(
    connectionString: string,
    private readonly options: { initialTripNumber?: number; now?: () => Date } = {},
  ) {
    this.sql = neon(connectionString);
    this.ready = this.ensureSchema();
  }

  async listUsers(): Promise<User[]> {
    await this.ready;
    const rows = await this.sql`select data from users order by email`;
    return rows.map((row) => row.data as User);
  }

  async updateUserProfile(userId: Id, input: UpdateUserProfileInput): Promise<User> {
    await this.ready;
    const user = await this.requireUser(userId);
    const updated: User = { ...user, shortCode: normalizeUserShortCode(input.shortCode), updatedAt: this.nowIso() };
    await this.sql`update users set data = ${toJson(updated)}, updated_at = ${updated.updatedAt} where id = ${userId}`;
    await this.appendActivity({
      level: "info",
      scope: "profile",
      message: "Updated user profile",
      documentName: null,
      details: { userId },
    });
    return clone(updated);
  }

  async requestLoginOtp(emailInput: string): Promise<RequestOtpResult> {
    await this.ready;
    const email = normalizeEmail(emailInput);
    const timestamp = this.now();
    const expiresAt = new Date(timestamp.getTime() + 5 * 60 * 1000).toISOString();
    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challenge: OtpChallenge = {
      id: `otp_${randomUUID()}`,
      email,
      otp,
      expiresAt,
      consumedAt: null,
      createdAt: timestamp.toISOString(),
    };
    await this.sql`
      insert into otp_challenges (id, email, otp, expires_at, consumed_at, created_at, data)
      values (${challenge.id}, ${challenge.email}, ${challenge.otp}, ${challenge.expiresAt}, null, ${challenge.createdAt}, ${toJson(challenge)})
    `;
    await this.appendActivity({
      level: "info",
      scope: "auth",
      message: "Requested login OTP",
      documentName: null,
      details: { email },
    });
    return { email, expiresAt, devOtp: otp };
  }

  async verifyLoginOtp(emailInput: string, otp: string): Promise<VerifyOtpResult> {
    await this.ready;
    const email = normalizeEmail(emailInput);
    const rows = await this.sql`
      select data
      from otp_challenges
      where email = ${email} and consumed_at is null
      order by created_at desc
      limit 1
    `;
    const challenge = rows[0]?.data as OtpChallenge | undefined;
    const now = this.now();
    if (!challenge || challenge.otp !== otp.trim() || new Date(challenge.expiresAt) < now) {
      throw new Error("Invalid or expired OTP.");
    }

    const consumedChallenge: OtpChallenge = { ...challenge, consumedAt: now.toISOString() };
    await this.sql`
      update otp_challenges
      set consumed_at = ${consumedChallenge.consumedAt}, data = ${toJson(consumedChallenge)}
      where id = ${challenge.id}
    `;
    const user = await this.findOrCreateUser(email, now);
    const session: AuthSession = {
      token: randomBytes(32).toString("base64url"),
      userId: user.id,
      expiresAt: new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now.toISOString(),
      revokedAt: null,
    };
    await this.sql`
      insert into auth_sessions (token, user_id, expires_at, created_at, revoked_at, data)
      values (${session.token}, ${session.userId}, ${session.expiresAt}, ${session.createdAt}, null, ${toJson(session)})
    `;
    await this.appendActivity({
      level: "info",
      scope: "auth",
      message: "Verified login OTP",
      documentName: null,
      details: { userId: user.id },
    });
    return { user: clone(user), session: clone(session) };
  }

  async getAuthSession(token: string): Promise<VerifyOtpResult | null> {
    await this.ready;
    const rows = await this.sql`
      select data
      from auth_sessions
      where token = ${token} and revoked_at is null and expires_at >= now()
      limit 1
    `;
    const session = rows[0]?.data as AuthSession | undefined;
    if (!session) return null;
    const user = await this.findUser(session.userId);
    return user ? { user, session } : null;
  }

  async revokeAuthSession(token: string): Promise<void> {
    await this.ready;
    const rows = await this.sql`select data from auth_sessions where token = ${token} and revoked_at is null limit 1`;
    const session = rows[0]?.data as AuthSession | undefined;
    if (!session) return;
    const revoked: AuthSession = { ...session, revokedAt: this.nowIso() };
    await this.sql`
      update auth_sessions set revoked_at = ${revoked.revokedAt}, data = ${toJson(revoked)} where token = ${token}
    `;
  }

  async listTrips(): Promise<Trip[]> {
    await this.ready;
    const rows = await this.sql`
      select data
      from trips
      where archived_at is null
      order by start_date nulls last, trip_number
    `;
    return rows.map((row) => row.data as Trip);
  }

  async createTrip(input: CreateTripInput): Promise<Trip> {
    await this.ready;
    const timestamp = this.nowIso();
    const tripNumber = await this.nextTripNumber();
    const title = input.title.trim() || `#${tripNumber}`;
    const trip: Trip = {
      id: `trip_${tripNumber}`,
      tripNumber,
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
    await this.sql`
      insert into trips (id, owner_user_id, trip_number, start_date, end_date, archived_at, data)
      values (${trip.id}, ${trip.ownerUserId}, ${trip.tripNumber}, ${trip.startDate}, ${trip.endDate}, null, ${toJson(trip)})
    `;
    await this.appendActivity({
      level: "info",
      scope: "trip",
      message: `Created trip ${trip.title}`,
      documentName: null,
      details: { tripId: trip.id },
    });
    return clone(trip);
  }

  async updateTrip(id: Id, input: UpdateTripInput): Promise<Trip> {
    await this.ready;
    const trip = await this.requireTrip(id);
    const updated: Trip = { ...trip, ...input, updatedAt: this.nowIso() };
    await this.sql`
      update trips
      set owner_user_id = ${updated.ownerUserId},
          start_date = ${updated.startDate},
          end_date = ${updated.endDate},
          archived_at = ${updated.archivedAt},
          data = ${toJson(updated)}
      where id = ${id}
    `;
    await this.appendActivity({
      level: "info",
      scope: "trip",
      message: `Updated trip ${updated.title}`,
      documentName: null,
      details: { tripId: id },
    });
    return clone(updated);
  }

  async listBookings(): Promise<Booking[]> {
    await this.ready;
    const rows = await this.sql`select data from bookings where deleted_at is null order by starts_at nulls last`;
    return rows.map((row) => this.normalizeBooking(row.data as Booking));
  }

  async createBookings(inputs: CreateBookingInput[]): Promise<Booking[]> {
    await this.ready;
    const timestamp = this.nowIso();
    const bookings = inputs.map<Booking>((input) => ({
      id: `booking_${randomUUID()}`,
      tripId: input.tripId,
      sourceDocumentId: input.sourceDocumentId,
      type: input.type,
      title: input.title,
      startAt: input.startAt,
      endAt: input.endAt,
      timePoints: input.timePoints ?? [],
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
      await this.sql`
        insert into bookings (id, trip_id, source_document_id, starts_at, ends_at, deleted_at, data)
        values (${booking.id}, ${booking.tripId}, ${booking.sourceDocumentId}, ${booking.startAt}, ${booking.endAt}, null, ${toJson(booking)})
      `;
    }
    return clone(bookings);
  }

  async updateBooking(id: Id, input: UpdateBookingInput): Promise<Booking> {
    await this.ready;
    const booking = await this.requireBooking(id);
    const updated: Booking = { ...booking, ...input, updatedAt: this.nowIso() };
    await this.sql`
      update bookings
      set trip_id = ${updated.tripId},
          starts_at = ${updated.startAt},
          ends_at = ${updated.endAt},
          deleted_at = ${updated.deletedAt},
          data = ${toJson(updated)}
      where id = ${id}
    `;
    await this.appendActivity({
      level: "info",
      scope: "booking",
      message: `Updated booking ${updated.title}`,
      documentName: null,
      details: { bookingId: id },
    });
    return clone(updated);
  }

  async assignBookingToTrip(bookingId: Id, tripId: Id | null): Promise<Booking> {
    await this.ready;
    const booking = await this.requireBooking(bookingId);
    const updated: Booking = { ...booking, tripId, updatedAt: this.nowIso() };
    await this.sql`
      update bookings set trip_id = ${tripId}, data = ${toJson(updated)} where id = ${bookingId}
    `;
    await this.appendActivity({
      level: "info",
      scope: "booking",
      message: "Assigned booking to trip",
      documentName: null,
      details: { bookingId, tripId },
    });
    return clone(updated);
  }

  async deleteBooking(id: Id): Promise<Booking> {
    await this.ready;
    const booking = await this.requireBooking(id);
    const timestamp = this.nowIso();
    const deleted: Booking = { ...booking, deletedAt: timestamp, updatedAt: timestamp };
    await this.sql`update bookings set deleted_at = ${timestamp}, data = ${toJson(deleted)} where id = ${id}`;
    await this.appendActivity({
      level: "info",
      scope: "booking",
      message: `Deleted booking ${deleted.title}`,
      documentName: null,
      details: { bookingId: id, documentId: deleted.sourceDocumentId },
    });
    return clone(deleted);
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    await this.ready;
    const rows = await this.sql`select data from documents where deleted_at is null order by created_at desc`;
    return rows.map((row) => row.data as DocumentRecord);
  }

  async createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
    await this.ready;
    const timestamp = this.nowIso();
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
    await this.sql`
      insert into documents (id, trip_id, storage_key, created_at, deleted_at, data)
      values (${document.id}, ${document.tripId}, ${document.storageKey}, ${document.createdAt}, null, ${toJson(document)})
    `;
    return clone(document);
  }

  async assignDocumentToTrip(documentId: Id, tripId: Id | null): Promise<DocumentRecord> {
    await this.ready;
    const document = await this.requireDocument(documentId);
    const updated: DocumentRecord = { ...document, tripId, updatedAt: this.nowIso() };
    await this.sql`update documents set trip_id = ${tripId}, data = ${toJson(updated)} where id = ${documentId}`;
    await this.appendActivity({
      level: "info",
      scope: "document",
      message: "Assigned document to trip",
      documentName: updated.originalFileName,
      details: { documentId, tripId },
    });
    return clone(updated);
  }

  async deleteDocument(id: Id): Promise<DocumentRecord> {
    await this.ready;
    const document = await this.requireDocument(id);
    const timestamp = this.nowIso();
    const deleted: DocumentRecord = { ...document, deletedAt: timestamp, updatedAt: timestamp };
    await this.sql`update documents set deleted_at = ${timestamp}, data = ${toJson(deleted)} where id = ${id}`;
    await this.appendActivity({
      level: "info",
      scope: "document",
      message: "Deleted document after last booking was removed",
      documentName: deleted.originalFileName,
      details: { documentId: id },
    });
    return clone(deleted);
  }

  async listAnalysisJobs(): Promise<AnalysisJob[]> {
    await this.ready;
    const rows = await this.sql`select data from analysis_jobs order by created_at desc`;
    return rows.map((row) => row.data as AnalysisJob);
  }

  async createAnalysisJob(input: CreateAnalysisJobInput): Promise<AnalysisJob> {
    await this.ready;
    const timestamp = this.nowIso();
    const job: AnalysisJob = {
      id: `analysis_${randomUUID()}`,
      status: "queued",
      sourceType: input.sourceType,
      documentName: input.documentName,
      tripId: input.tripId,
      currentUserId: input.currentUserId,
      bookingCount: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    };
    await this.sql`
      insert into analysis_jobs (id, status, current_user_id, created_at, completed_at, data)
      values (${job.id}, ${job.status}, ${job.currentUserId}, ${job.createdAt}, null, ${toJson(job)})
    `;
    return clone(job);
  }

  async updateAnalysisJob(id: Id, input: UpdateAnalysisJobInput): Promise<AnalysisJob> {
    await this.ready;
    const job = await this.requireAnalysisJob(id);
    const updated: AnalysisJob = { ...job, ...input, updatedAt: this.nowIso() };
    await this.sql`
      update analysis_jobs
      set status = ${updated.status}, completed_at = ${updated.completedAt}, data = ${toJson(updated)}
      where id = ${id}
    `;
    return clone(updated);
  }

  async appendActivity(entry: Omit<ActivityLogEntry, "id" | "timestamp">): Promise<ActivityLogEntry> {
    await this.ready;
    const activity: ActivityLogEntry = {
      ...entry,
      id: `act_${randomUUID()}`,
      timestamp: this.nowIso(),
    };
    await this.sql`
      insert into activity_log (id, timestamp, level, scope, document_name, data)
      values (${activity.id}, ${activity.timestamp}, ${activity.level}, ${activity.scope}, ${activity.documentName}, ${toJson(activity)})
    `;
    return clone(activity);
  }

  async listActivity(): Promise<ActivityLogEntry[]> {
    await this.ready;
    const rows = await this.sql`select data from activity_log order by timestamp desc limit 500`;
    return rows.map((row) => row.data as ActivityLogEntry);
  }

  async getCalendarView(now: Date = this.now()): Promise<CalendarView> {
    const trips = await this.listTrips();
    const users = await this.listUsers();
    const tripById = new Map(trips.map((trip) => [trip.id, trip]));
    const bookings = (await this.listBookings()).map<CalendarBooking>((booking) => {
      const trip = booking.tripId ? tripById.get(booking.tripId) ?? null : null;
      return {
        ...booking,
        trip: trip ? { id: trip.id, tripNumber: trip.tripNumber, title: trip.title, color: trip.color } : null,
      };
    });
    return { generatedAt: isoDate(now), bookings, trips, users };
  }

  private async ensureSchema(): Promise<void> {
    await this.sql`create table if not exists users (
      id text primary key,
      email text not null unique,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      data jsonb not null
    )`;
    await this.sql`create table if not exists otp_challenges (
      id text primary key,
      email text not null,
      otp text not null,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null,
      data jsonb not null
    )`;
    await this.sql`create index if not exists otp_challenges_email_created_idx on otp_challenges (email, created_at desc)`;
    await this.sql`create table if not exists auth_sessions (
      token text primary key,
      user_id text not null,
      expires_at timestamptz not null,
      created_at timestamptz not null,
      revoked_at timestamptz,
      data jsonb not null
    )`;
    await this.sql`create table if not exists trips (
      id text primary key,
      owner_user_id text not null,
      trip_number text not null unique,
      start_date date,
      end_date date,
      archived_at timestamptz,
      data jsonb not null
    )`;
    await this.sql`create index if not exists trips_owner_idx on trips (owner_user_id)`;
    await this.sql`create table if not exists documents (
      id text primary key,
      trip_id text,
      storage_key text,
      created_at timestamptz not null,
      deleted_at timestamptz,
      data jsonb not null
    )`;
    await this.sql`create table if not exists bookings (
      id text primary key,
      trip_id text,
      source_document_id text,
      starts_at timestamptz,
      ends_at timestamptz,
      deleted_at timestamptz,
      data jsonb not null
    )`;
    await this.sql`create index if not exists bookings_starts_at_idx on bookings (starts_at)`;
    await this.sql`create index if not exists bookings_trip_idx on bookings (trip_id)`;
    await this.sql`create table if not exists analysis_jobs (
      id text primary key,
      status text not null,
      current_user_id text not null,
      created_at timestamptz not null,
      completed_at timestamptz,
      data jsonb not null
    )`;
    await this.sql`create table if not exists activity_log (
      id text primary key,
      timestamp timestamptz not null,
      level text not null,
      scope text not null,
      document_name text,
      data jsonb not null
    )`;
    await this.sql`create index if not exists activity_log_timestamp_idx on activity_log (timestamp desc)`;
  }

  private async findUser(id: Id): Promise<User | null> {
    const rows = await this.sql`select data from users where id = ${id} limit 1`;
    return (rows[0]?.data as User | undefined) ?? null;
  }

  private async requireUser(id: Id): Promise<User> {
    const user = await this.findUser(id);
    if (!user) throw new Error(`User not found: ${id}`);
    return user;
  }

  private async requireTrip(id: Id): Promise<Trip> {
    const rows = await this.sql`select data from trips where id = ${id} and archived_at is null limit 1`;
    const trip = rows[0]?.data as Trip | undefined;
    if (!trip) throw new Error(`Trip not found: ${id}`);
    return trip;
  }

  private async requireBooking(id: Id): Promise<Booking> {
    const rows = await this.sql`select data from bookings where id = ${id} and deleted_at is null limit 1`;
    const booking = rows[0]?.data ? this.normalizeBooking(rows[0].data as Booking) : undefined;
    if (!booking) throw new Error(`Booking not found: ${id}`);
    return booking;
  }

  private async requireDocument(id: Id): Promise<DocumentRecord> {
    const rows = await this.sql`select data from documents where id = ${id} and deleted_at is null limit 1`;
    const document = rows[0]?.data as DocumentRecord | undefined;
    if (!document) throw new Error(`Document not found: ${id}`);
    return document;
  }

  private async requireAnalysisJob(id: Id): Promise<AnalysisJob> {
    const rows = await this.sql`select data from analysis_jobs where id = ${id} limit 1`;
    const job = rows[0]?.data as AnalysisJob | undefined;
    if (!job) throw new Error(`Analysis job not found: ${id}`);
    return job;
  }

  private async findOrCreateUser(email: string, now: Date): Promise<User> {
    const rows = await this.sql`select data from users where email = ${email} limit 1`;
    const existing = rows[0]?.data as User | undefined;
    if (existing) return existing;

    const timestamp = now.toISOString();
    const user: User = {
      id: `user_${randomUUID()}`,
      email,
      shortCode: userShortCode(email),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.sql`
      insert into users (id, email, created_at, updated_at, data)
      values (${user.id}, ${user.email}, ${user.createdAt}, ${user.updatedAt}, ${toJson(user)})
    `;
    return user;
  }

  private async nextTripNumber(): Promise<string> {
    const rows = await this.sql`select max((trip_number)::int) as max_trip_number from trips`;
    const current = rows[0]?.max_trip_number;
    const nextNumber = current === null || current === undefined ? this.options.initialTripNumber ?? 200 : Number(current) + 1;
    return String(nextNumber).padStart(3, "0");
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private normalizeBooking(booking: Booking): Booking {
    return {
      ...booking,
      participantUserIds: booking.participantUserIds ?? [],
      timePoints: booking.timePoints ?? [],
    };
  }
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
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
