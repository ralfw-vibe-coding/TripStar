import type { Booking, Id } from "../model";
import type { TripStarStateProvider, UpdateBookingInput } from "../providers/state-provider";

export async function updateBooking(
  provider: TripStarStateProvider,
  id: Id,
  input: UpdateBookingInput,
): Promise<Booking> {
  if (input.title !== undefined && input.title.trim().length === 0) {
    throw new Error("Booking title is required.");
  }
  return provider.updateBooking(id, input);
}

export async function assignBookingToTrip(
  provider: TripStarStateProvider,
  bookingId: Id,
  tripId: Id | null,
): Promise<Booking> {
  return provider.assignBookingToTrip(bookingId, tripId);
}
