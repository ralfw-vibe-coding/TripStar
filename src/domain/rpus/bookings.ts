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

export interface DeleteBookingResult {
  booking: Booking;
  deletedDocumentId: Id | null;
}

export async function deleteBooking(provider: TripStarStateProvider, bookingId: Id): Promise<DeleteBookingResult> {
  const booking = (await provider.listBookings()).find((candidate) => candidate.id === bookingId);
  if (!booking) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  const deletedBooking = await provider.deleteBooking(bookingId);
  let deletedDocumentId: Id | null = null;
  if (booking.sourceDocumentId) {
    const remainingDocumentBookings = (await provider.listBookings()).filter(
      (candidate) => candidate.sourceDocumentId === booking.sourceDocumentId,
    );
    if (remainingDocumentBookings.length === 0) {
      const document = (await provider.listDocuments()).find((d) => d.id === booking.sourceDocumentId);
      // Receipts have independent value in TripRep — keep them even without bookings
      // Receipts have independent value in TripRep — their tripId is managed there,
      // not by the booking relationship.
      if (!document?.isReceipt) {
        await provider.deleteDocument(booking.sourceDocumentId);
        deletedDocumentId = booking.sourceDocumentId;
      }
    }
  }

  return { booking: deletedBooking, deletedDocumentId };
}
