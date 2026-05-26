import {
  CalendarDays,
  Check,
  FileUp,
  Hotel,
  Plane,
  Plus,
  TrainFront,
  UserRoundCheck,
  X,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { CalendarBooking, CalendarView, Trip, User } from "../domain/model";
import { assignBookingTrip, createTrip, fetchCalendar } from "./api";
import { tripColor } from "./trip-colors";

const ownerUserId = "user_ralf";

export function App() {
  const [view, setView] = useState<CalendarView | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"calendar" | "reports">("calendar");
  const [error, setError] = useState<string | null>(null);
  const [isTripDialogOpen, setIsTripDialogOpen] = useState(false);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);

  useEffect(() => {
    void fetchCalendar()
      .then(setView)
      .catch((caught: Error) => setError(caught.message));
  }, []);

  const ownTrips = useMemo(
    () => sortTripsByStartDate(view?.trips.filter((trip) => trip.ownerUserId === ownerUserId) ?? []),
    [view?.trips],
  );
  const sharedTrips = useMemo(
    () =>
      sortTripsByStartDate(
        view?.trips.filter((trip) => trip.ownerUserId !== ownerUserId || trip.sharedWithUserIds.includes(ownerUserId)) ?? [],
      ),
    [view?.trips],
  );

  async function handleTripCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!view) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const sharedWithUserIds = data.getAll("sharedWithUserIds").map(String);

    setIsCreatingTrip(true);
    setError(null);
    try {
      const trip = await createTrip({
        title: String(data.get("title")),
        startDate: String(data.get("startDate")),
        endDate: String(data.get("endDate")),
        places: String(data.get("places")),
        sharedWithUserIds,
        ownerUserId,
      });
      setView({ ...view, trips: [...view.trips, trip] });
      setIsTripDialogOpen(false);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Trip could not be created.");
    } finally {
      setIsCreatingTrip(false);
    }
  }

  async function handleAssignBooking(booking: CalendarBooking, tripId: string | null) {
    if (!view) return;
    const trip = view.trips.find((candidate) => candidate.id === tripId) ?? null;
    const previousView = view;
    setView({
      ...view,
      bookings: view.bookings.map((candidate) =>
        candidate.id === booking.id
          ? {
              ...candidate,
              tripId,
              trip: trip
                ? {
                    id: trip.id,
                    tripNumber: trip.tripNumber,
                    shortCode: trip.shortCode,
                    title: trip.title,
                    color: trip.color,
                  }
                : null,
            }
          : candidate,
      ),
    });

    try {
      await assignBookingTrip(booking.id, tripId);
    } catch (caught) {
      setView(previousView);
      setError(caught instanceof Error ? caught.message : "Booking could not be assigned.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">T*</span>
          <div>
            <h1>TripStar</h1>
            <p>TripCal + TripRep</p>
          </div>
        </div>

        <nav className="nav">
          <button className={activeSection === "calendar" ? "active" : ""} onClick={() => setActiveSection("calendar")}>
            <CalendarDays size={18} />
            Calendar
          </button>
          <button className={activeSection === "reports" ? "active" : ""} onClick={() => setActiveSection("reports")}>
            <UserRoundCheck size={18} />
            Reports
          </button>
        </nav>

        <section className="trip-list-panel">
          <header className="panel-header">
            <h2>Trips</h2>
            <button className="icon-command" type="button" aria-label="Create trip" onClick={() => setIsTripDialogOpen(true)}>
              <Plus size={18} />
            </button>
          </header>
          <TripList title="Mine" trips={ownTrips} />
          <TripList title="Shared" trips={sharedTrips} />
        </section>
      </aside>

      <section className="workspace">
        {error && <div className="notice">{error}</div>}

        {activeSection === "calendar" ? (
          <CalendarPanel
            view={view}
            expandedBookingId={expandedBookingId}
            onToggleBooking={(id) => setExpandedBookingId((current) => (current === id ? null : id))}
            onAssign={handleAssignBooking}
          />
        ) : (
          <ReportsPanel trips={view?.trips ?? []} />
        )}
      </section>

      {isTripDialogOpen && view && (
        <TripDialog
          users={view.users}
          onClose={() => setIsTripDialogOpen(false)}
          onSubmit={handleTripCreate}
          isSubmitting={isCreatingTrip}
        />
      )}
    </main>
  );
}

function TripList({ title, trips }: { title: string; trips: Trip[] }) {
  return (
    <section className="trip-group">
      <h3>{title}</h3>
      <div className="trip-stack">
        {trips.length === 0 ? (
          <p className="muted-small">No trips</p>
        ) : (
          trips.map((trip) => (
            <article className="trip-row" key={trip.id}>
              <span className="trip-swatch" style={{ background: tripColor(trip) }} />
              <span className="trip-row-main">
                <strong>{trip.title}</strong>
                {trip.title !== `#${trip.tripNumber}` && <span>#{trip.tripNumber}</span>}
              </span>
              <span className="trip-row-dates">
                {shortDate(trip.startDate)}-{shortDate(trip.endDate)}
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function CalendarPanel({
  view,
  expandedBookingId,
  onToggleBooking,
  onAssign,
}: {
  view: CalendarView | null;
  expandedBookingId: string | null;
  onToggleBooking: (id: string) => void;
  onAssign: (booking: CalendarBooking, tripId: string | null) => void;
}) {
  if (!view) {
    return <div className="loading">Loading calendar...</div>;
  }

  return (
    <section className="calendar-panel" aria-label="Bookings">
      <header className="section-header">
        <div>
          <h2>Calendar</h2>
          <p>{view.bookings.length} upcoming bookings</p>
        </div>
        <button className="icon-command" aria-label="Upload document">
          <FileUp size={18} />
        </button>
      </header>

      <div className="booking-stack">
        {view.bookings.map((booking) => (
          <article
            key={booking.id}
            className={`booking-card ${expandedBookingId === booking.id ? "expanded" : ""}`}
            style={{ borderLeftColor: booking.trip ? tripColorForBooking(booking.trip) : "#cfd8df" }}
          >
            <button className="booking-summary" onClick={() => onToggleBooking(booking.id)}>
              <span className="booking-icon">{iconForType(booking.type)}</span>
              <span className="booking-main">
                <strong>{booking.title}</strong>
                <span>{formatBookingTime(booking)}</span>
              </span>
              <span className="booking-trip">{booking.trip?.shortCode ?? "Inbox"}</span>
              <span className="status-pill">{booking.status}</span>
            </button>

            {expandedBookingId === booking.id && (
              <div className="booking-details">
                <dl className="detail-grid">
                  <div>
                    <dt>From</dt>
                    <dd>{booking.fromText ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>To</dt>
                    <dd>{booking.toText ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Travelers</dt>
                    <dd>{booking.travelers.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Operator</dt>
                    <dd>{booking.operator ?? "-"}</dd>
                  </div>
                </dl>

                <div className="detail-actions">
                  <label className="field-label">
                    Trip
                    <select value={booking.tripId ?? ""} onChange={(event) => onAssign(booking, event.target.value || null)}>
                      <option value="">Inbox / no trip</option>
                      {view.trips.map((trip) => (
                        <option key={trip.id} value={trip.id}>
                          {trip.title} #{trip.tripNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="details-text">{booking.details}</p>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function TripDialog({
  users,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  users: User[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="trip-dialog" onSubmit={onSubmit}>
        <header className="dialog-header">
          <div>
            <h2>Create trip</h2>
            <p>Details can be changed later.</p>
          </div>
          <button className="icon-command" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <label className="field-label">
          Title
          <input name="title" placeholder="Trip number if empty" />
        </label>

        <div className="date-grid">
          <label className="field-label">
            Starting date *
            <input name="startDate" type="date" required onChange={fillEndDateIfEmpty} />
          </label>
          <label className="field-label">
            End date *
            <input name="endDate" type="date" required />
          </label>
        </div>

        <label className="field-label">
          Places *
          <input name="places" placeholder="San Francisco, Palo Alto" required />
        </label>

        <fieldset className="user-picker">
          <legend>Share with</legend>
          {users
            .filter((user) => user.id !== ownerUserId)
            .map((user) => (
              <label key={user.id}>
                <input type="checkbox" name="sharedWithUserIds" value={user.id} />
                <span>{user.shortCode}</span>
                {user.displayName}
              </label>
            ))}
        </fieldset>

        <footer className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            <X size={16} />
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            <Check size={16} />
            {isSubmitting ? "Creating" : "Create"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ReportsPanel({ trips }: { trips: Trip[] }) {
  return (
    <section className="reports">
      <header className="section-header">
        <div>
          <h2>Reports</h2>
          <p>Report scaffolding for daily allowances and receipts</p>
        </div>
      </header>
      <div className="report-grid">
        {trips.map((trip) => (
          <article className="report-row" key={trip.id}>
            <span className="trip-swatch" style={{ background: tripColor(trip) }} />
            <strong>{trip.title}</strong>
            <span>
              {trip.startDate} to {trip.endDate}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function iconForType(type: CalendarBooking["type"]) {
  if (type === "flight") return <Plane size={18} />;
  if (type === "lodging") return <Hotel size={18} />;
  if (type === "train") return <TrainFront size={18} />;
  return <CalendarDays size={18} />;
}

function formatBookingTime(booking: CalendarBooking): string {
  if (!booking.startAt) return "No date";
  const start = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(booking.startAt));
  return booking.toText ? `${start} · ${booking.toText}` : start;
}

function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function sortTripsByStartDate(trips: Trip[]): Trip[] {
  return [...trips].sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function tripColorForBooking(trip: NonNullable<CalendarBooking["trip"]>): string {
  return tripColor(trip);
}

function fillEndDateIfEmpty(event: ChangeEvent<HTMLInputElement>): void {
  const form = event.currentTarget.form;
  const startDate = event.currentTarget.value;
  if (!form || !startDate) return;

  const endInput = form.elements.namedItem("endDate");
  if (!(endInput instanceof HTMLInputElement) || endInput.value) return;

  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  endInput.value = date.toISOString().slice(0, 10);
}
