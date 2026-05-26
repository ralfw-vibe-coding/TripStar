import type { Booking, CalendarView, Trip } from "../domain/model";
import type { CreateTripInput } from "../domain/providers/state-provider";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchCalendar(): Promise<CalendarView> {
  return requestJson<CalendarView>("/api/calendar");
}

export function createTrip(input: CreateTripInput): Promise<Trip> {
  return requestJson<Trip>("/api/trips", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function assignBookingTrip(bookingId: string, tripId: string | null): Promise<Booking> {
  return requestJson<Booking>(`/api/bookings/${bookingId}/trip`, {
    method: "PATCH",
    body: JSON.stringify({ tripId }),
  });
}
