import type { Id, Trip } from "../model";
import type { CreateTripInput, TripStarStateProvider, UpdateTripInput } from "../providers/state-provider";

export async function listTrips(provider: TripStarStateProvider): Promise<Trip[]> {
  return provider.listTrips();
}

export async function createTrip(provider: TripStarStateProvider, input: CreateTripInput): Promise<Trip> {
  validateTripDates(input.startDate, input.endDate);
  return provider.createTrip(input);
}

export async function updateTrip(
  provider: TripStarStateProvider,
  id: Id,
  input: UpdateTripInput,
): Promise<Trip> {
  if (input.startDate && input.endDate) {
    validateTripDates(input.startDate, input.endDate);
  }
  return provider.updateTrip(id, input);
}

function validateTripDates(startDate: string, endDate: string): void {
  if (endDate < startDate) {
    throw new Error("Trip end date must not be before start date.");
  }
}
