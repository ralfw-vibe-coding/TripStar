import type { ActivityLogEntry, Booking, CalendarView, DocumentRecord, Id, Trip, User } from "../../model";
import type {
  CreateTripInput,
  RequestOtpResult,
  TripStarStateProvider,
  UpdateUserProfileInput,
  UpdateBookingInput,
  UpdateTripInput,
  VerifyOtpResult,
} from "../state-provider";

export class PostgresStateProvider implements TripStarStateProvider {
  constructor(private readonly connectionString: string) {}

  async listUsers(): Promise<User[]> {
    return this.notImplemented();
  }

  async updateUserProfile(_userId: Id, _input: UpdateUserProfileInput): Promise<User> {
    return this.notImplemented();
  }

  async requestLoginOtp(_email: string): Promise<RequestOtpResult> {
    return this.notImplemented();
  }

  async verifyLoginOtp(_email: string, _otp: string): Promise<VerifyOtpResult> {
    return this.notImplemented();
  }

  async getAuthSession(_token: string): Promise<VerifyOtpResult | null> {
    return this.notImplemented();
  }

  async revokeAuthSession(_token: string): Promise<void> {
    return this.notImplemented();
  }

  async listTrips(): Promise<Trip[]> {
    return this.notImplemented();
  }

  async createTrip(_input: CreateTripInput): Promise<Trip> {
    return this.notImplemented();
  }

  async updateTrip(_id: Id, _input: UpdateTripInput): Promise<Trip> {
    return this.notImplemented();
  }

  async listBookings(): Promise<Booking[]> {
    return this.notImplemented();
  }

  async updateBooking(_id: Id, _input: UpdateBookingInput): Promise<Booking> {
    return this.notImplemented();
  }

  async assignBookingToTrip(_bookingId: Id, _tripId: Id | null): Promise<Booking> {
    return this.notImplemented();
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    return this.notImplemented();
  }

  async assignDocumentToTrip(_documentId: Id, _tripId: Id | null): Promise<DocumentRecord> {
    return this.notImplemented();
  }

  async appendActivity(_entry: Omit<ActivityLogEntry, "id" | "timestamp">): Promise<ActivityLogEntry> {
    return this.notImplemented();
  }

  async listActivity(): Promise<ActivityLogEntry[]> {
    return this.notImplemented();
  }

  async getCalendarView(_now?: Date): Promise<CalendarView> {
    return this.notImplemented();
  }

  private notImplemented<T>(): Promise<T> {
    void this.connectionString;
    throw new Error("PostgresStateProvider is not wired yet. Use LocalStateProvider for local/test runs.");
  }
}
