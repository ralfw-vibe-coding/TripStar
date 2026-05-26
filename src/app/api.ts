import type { ActivityLogEntry, AuthSession, Booking, CalendarView, Trip, User } from "../domain/model";
import type { CreateTripInput } from "../domain/providers/state-provider";

const authTokenStorageKey = "tripstar.authToken";

export function getStoredAuthToken(): string | null {
  return localStorage.getItem(authTokenStorageKey);
}

export function storeAuthToken(token: string): void {
  localStorage.setItem(authTokenStorageKey, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(authTokenStorageKey);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredAuthToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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

export function fetchActivityLog(): Promise<ActivityLogEntry[]> {
  return requestJson<ActivityLogEntry[]>("/api/activity-log");
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

export function requestOtp(email: string): Promise<{ email: string; expiresAt: string; devOtp?: string }> {
  return requestJson("/api/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyOtp(email: string, otp: string): Promise<{ user: User; session: AuthSession }> {
  return requestJson("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });
}

export function fetchCurrentUser(): Promise<{ user: User | null }> {
  return requestJson("/api/auth/me");
}

export function logout(): Promise<{ ok: true }> {
  return requestJson("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
}

export function updateProfile(input: { shortCode: string }): Promise<{ user: User }> {
  return requestJson("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function submitTextDocument(input: { text: string; tripId: string | null }): Promise<{
  document: unknown | null;
  bookings: Booking[];
}> {
  return requestJson("/api/documents/text", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function submitImageDocument(input: { base64: string; mimeType: string; tripId: string | null }): Promise<{
  document: unknown | null;
  bookings: Booking[];
}> {
  return requestJson("/api/documents/image", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function submitPdfDocuments(input: {
  documents: Array<{ base64: string; originalFileName: string }>;
  tripId: string | null;
}): Promise<{
  documents: unknown[];
  bookings: Booking[];
}> {
  return requestJson("/api/documents/pdf", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchDocumentOriginal(documentId: string): Promise<{
  id: string;
  originalFileName: string | null;
  mimeType: string | null;
  sourceType: string;
  base64: string | null;
  text: string | null;
}> {
  return requestJson(`/api/documents/${documentId}/original`);
}
