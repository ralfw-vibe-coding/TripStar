import type { Id, Trip } from "../model";
import type { CreateTripInput, TripStarStateProvider, UpdateTripInput } from "../providers/state-provider";

export async function listTrips(provider: TripStarStateProvider): Promise<Trip[]> {
  return provider.listTrips();
}

export async function listArchivedTrips(provider: TripStarStateProvider, ownerUserId: Id): Promise<Trip[]> {
  return provider.listArchivedTrips(ownerUserId);
}

/**
 * The one place that decides what the next trip number is. Providers only
 * report the current state (`currentMaxTripNumber`); the +1 and the string
 * format are domain rules, not persistence concerns.
 */
export async function suggestNextTripNumber(provider: TripStarStateProvider): Promise<string> {
  const currentMax = await provider.currentMaxTripNumber();
  return formatTripNumber(currentMax + 1);
}

export async function createTrip(provider: TripStarStateProvider, input: CreateTripInput): Promise<Trip> {
  validateTripDates(input.startDate, input.endDate);
  const tripNumber = input.tripNumber ?? await suggestNextTripNumber(provider);
  return provider.createTrip({ ...input, tripNumber });
}

function formatTripNumber(n: number): string {
  return String(n).padStart(3, "0");
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

export async function archiveTrip(provider: TripStarStateProvider, id: Id, ownerUserId: Id): Promise<Trip> {
  return provider.archiveTrip(id, ownerUserId);
}

export async function unarchiveTrip(provider: TripStarStateProvider, id: Id, ownerUserId: Id): Promise<Trip> {
  return provider.unarchiveTrip(id, ownerUserId);
}

function validateTripDates(startDate: string, endDate: string): void {
  if (endDate < startDate) {
    throw new Error("Trip end date must not be before start date.");
  }
}
