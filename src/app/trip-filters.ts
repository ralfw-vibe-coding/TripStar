import type { Trip } from "../domain/model";

export function ownTripsForUser(trips: Trip[], userId: string): Trip[] {
  return sortTripsByStartDate(trips.filter((trip) => trip.ownerUserId === userId));
}

export function sharedTripsForUser(trips: Trip[], userId: string): Trip[] {
  return sortTripsByStartDate(trips.filter((trip) => trip.ownerUserId !== userId && trip.sharedWithUserIds.includes(userId)));
}

function sortTripsByStartDate(trips: Trip[]): Trip[] {
  return [...trips].sort((left, right) => left.startDate.localeCompare(right.startDate));
}
