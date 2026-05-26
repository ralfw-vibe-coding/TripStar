import type { ActivityLogEntry, Booking, CalendarBooking, CalendarView, DocumentRecord, Id, Trip, User } from "../../model";
import type { CreateTripInput, TripStarStateProvider, UpdateBookingInput, UpdateTripInput } from "../state-provider";
import { createId } from "./id";
import { seedBookings, seedDocuments, seedTrips, seedUsers } from "./seed";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface LocalStateProviderOptions {
  users?: User[];
  trips?: Trip[];
  bookings?: Booking[];
  documents?: DocumentRecord[];
  activity?: ActivityLogEntry[];
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
  private now: () => Date;
  private stateFilePath: string | null;
  private initialTripNumber: number;

  constructor(options: LocalStateProviderOptions = {}) {
    const persisted = options.stateFilePath ? this.readPersistedState(options.stateFilePath) : null;
    this.users = clone(options.users ?? persisted?.users ?? seedUsers);
    this.trips = this.normalizeTrips(clone(options.trips ?? persisted?.trips ?? seedTrips));
    this.bookings = clone(options.bookings ?? persisted?.bookings ?? seedBookings);
    this.documents = clone(options.documents ?? persisted?.documents ?? seedDocuments);
    this.activity = clone(options.activity ?? persisted?.activity ?? []);
    this.now = options.now ?? (() => new Date());
    this.stateFilePath = options.stateFilePath ?? null;
    this.initialTripNumber = options.initialTripNumber ?? 200;
  }

  async listUsers(): Promise<User[]> {
    return clone(this.users);
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
      .filter((booking) => booking.startAt === null || new Date(booking.startAt) >= this.startOfDay(now))
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

  private persist(): void {
    if (!this.stateFilePath) {
      return;
    }

    mkdirSync(dirname(this.stateFilePath), { recursive: true });
    writeFileSync(
      this.stateFilePath,
      JSON.stringify(
        {
          users: this.users,
          trips: this.trips,
          bookings: this.bookings,
          documents: this.documents,
          activity: this.activity,
        },
        null,
        2,
      ),
    );
  }
}
