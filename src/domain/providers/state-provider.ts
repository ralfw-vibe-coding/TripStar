import type { ActivityLogEntry, Booking, CalendarView, DocumentRecord, Id, Trip, User } from "../model";

export interface CreateTripInput {
  title: string;
  ownerUserId: Id;
  shortCode?: string;
  startDate: string;
  endDate: string;
  places: string;
  sharedWithUserIds: Id[];
  color?: string;
}

export interface UpdateTripInput {
  title?: string;
  shortCode?: string;
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
  fromText?: string | null;
  toText?: string | null;
  travelers?: string[];
  status?: Booking["status"];
  serviceIdentifier?: string | null;
  operator?: string | null;
  details?: string;
}

export interface TripStarStateProvider {
  listUsers(): Promise<User[]>;
  listTrips(): Promise<Trip[]>;
  createTrip(input: CreateTripInput): Promise<Trip>;
  updateTrip(id: Id, input: UpdateTripInput): Promise<Trip>;

  listBookings(): Promise<Booking[]>;
  updateBooking(id: Id, input: UpdateBookingInput): Promise<Booking>;
  assignBookingToTrip(bookingId: Id, tripId: Id | null): Promise<Booking>;

  listDocuments(): Promise<DocumentRecord[]>;
  assignDocumentToTrip(documentId: Id, tripId: Id | null): Promise<DocumentRecord>;

  appendActivity(entry: Omit<ActivityLogEntry, "id" | "timestamp">): Promise<ActivityLogEntry>;
  listActivity(): Promise<ActivityLogEntry[]>;

  getCalendarView(now?: Date): Promise<CalendarView>;
}
