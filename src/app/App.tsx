import {
  CalendarDays,
  Check,
  FileUp,
  Hotel,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  Plane,
  Plus,
  UserCircle,
  TrainFront,
  UserRoundCheck,
  X,
} from "lucide-react";
import { ChangeEvent, ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityLogEntry, CalendarBooking, CalendarView, Trip, User } from "../domain/model";
import {
  assignBookingTrip,
  clearAuthToken,
  createTrip,
  fetchActivityLog,
  fetchCalendar,
  fetchCurrentUser,
  getStoredAuthToken,
  logout,
  requestOtp,
  storeAuthToken,
  submitImageDocument,
  submitTextDocument,
  updateProfile,
  verifyOtp,
} from "./api";
import { tripColor } from "./trip-colors";
import { ownTripsForUser, sharedTripsForUser } from "./trip-filters";

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [view, setView] = useState<CalendarView | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"calendar" | "reports">("calendar");
  const [error, setError] = useState<string | null>(null);
  const [isTripDialogOpen, setIsTripDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  useEffect(() => {
    if (!getStoredAuthToken()) {
      setIsAuthChecked(true);
      return;
    }

    void fetchCurrentUser()
      .then(({ user }) => setCurrentUser(user))
      .catch(() => clearAuthToken())
      .finally(() => setIsAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void reloadWorkspace()
      .catch((caught: Error) => setError(caught.message));
  }, [currentUser]);

  const ownTrips = useMemo(
    () => (currentUser ? ownTripsForUser(view?.trips ?? [], currentUser.id) : []),
    [currentUser?.id, view?.trips],
  );
  const sharedTrips = useMemo(() => (currentUser ? sharedTripsForUser(view?.trips ?? [], currentUser.id) : []), [
    currentUser?.id,
    view?.trips,
  ]);

  async function handleTripCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!view || !currentUser) return;

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
        ownerUserId: currentUser.id,
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

  async function handleLogout() {
    await logout().catch(() => undefined);
    clearAuthToken();
    setCurrentUser(null);
    setView(null);
    setIsProfileMenuOpen(false);
  }

  async function handleProfileUpdate(user: User) {
    setCurrentUser(user);
    setIsProfileDialogOpen(false);
    setIsProfileMenuOpen(false);
    setView((current) => (current ? { ...current, users: current.users.map((candidate) => (candidate.id === user.id ? user : candidate)) } : current));
  }

  async function reloadCalendar() {
    const [calendar, activity] = await Promise.all([fetchCalendar(), fetchActivityLog()]);
    setView(calendar);
    setActivityLog(activity);
  }

  async function reloadWorkspace() {
    await reloadCalendar();
  }

  if (!isAuthChecked) {
    return <div className="auth-loading">Loading...</div>;
  }

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />;
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

        <div className="profile-menu">
          <button className="profile-button" type="button" onClick={() => setIsProfileMenuOpen((open) => !open)}>
            <UserCircle size={20} />
            <span>{currentUser.shortCode}</span>
          </button>
          {isProfileMenuOpen && (
            <div className="profile-popover">
              <div className="profile-summary">
                <strong>{currentUser.displayName}</strong>
                <span>{currentUser.email}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsProfileDialogOpen(true);
                  setIsProfileMenuOpen(false);
                }}
              >
                <UserCircle size={16} />
                Profile
              </button>
              <button type="button" onClick={handleLogout}>
                <LogOut size={16} />
                Logout
              </button>
            </div>
          )}
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
            currentUser={currentUser}
            expandedBookingId={expandedBookingId}
            onToggleBooking={(id) => setExpandedBookingId((current) => (current === id ? null : id))}
            onAssign={handleAssignBooking}
            onAddDocument={() => setIsDocumentDialogOpen(true)}
            activityLog={activityLog}
          />
        ) : (
          <ReportsPanel trips={view?.trips ?? []} />
        )}
      </section>

      {isTripDialogOpen && view && (
        <TripDialog
          users={view.users}
          currentUserId={currentUser.id}
          onClose={() => setIsTripDialogOpen(false)}
          onSubmit={handleTripCreate}
          isSubmitting={isCreatingTrip}
        />
      )}

      {isProfileDialogOpen && (
        <ProfileDialog user={currentUser} onClose={() => setIsProfileDialogOpen(false)} onSave={handleProfileUpdate} />
      )}

      {isDocumentDialogOpen && view && (
        <TextDocumentDialog
          trips={visibleTripsForUser(view.trips, currentUser.id)}
          onClose={() => setIsDocumentDialogOpen(false)}
          onRefresh={reloadWorkspace}
          onSubmitted={async () => {
            setIsDocumentDialogOpen(false);
            await reloadCalendar();
          }}
        />
      )}
    </main>
  );
}

function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "otp">("email");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await requestOtp(email);
      setEmail(result.email);
      setDevOtp(result.devOtp ?? null);
      setStep("otp");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not request OTP.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await verifyOtp(email, otp);
      storeAuthToken(result.session.token);
      onLogin(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify OTP.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand">
          <span className="brand-mark">T*</span>
          <div>
            <h1>TripStar</h1>
            <p>TripCal + TripRep</p>
          </div>
        </div>

        {step === "email" ? (
          <form className="auth-form" onSubmit={handleRequestOtp}>
            <h2>Sign in</h2>
            <label className="field-label">
              Email *
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            {error && <div className="notice">{error}</div>}
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleVerifyOtp}>
            <h2>Enter OTP</h2>
            <p className="muted-small">{email}</p>
            {devOtp && <div className="dev-otp">Local OTP: {devOtp}</div>}
            <label className="field-label">
              OTP *
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                required
              />
            </label>
            {error && <div className="notice">{error}</div>}
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setStep("email")}>
                Back
              </button>
              <button className="primary-button" type="submit" disabled={isSubmitting}>
                Sign in
              </button>
            </div>
          </form>
        )}
      </section>
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

function ProfileDialog({ user, onClose, onSave }: { user: User; onClose: () => void; onSave: (user: User) => void }) {
  const [shortCode, setShortCode] = useState(user.shortCode);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await updateProfile({ shortCode });
      onSave(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="profile-dialog" onSubmit={handleSubmit}>
        <header className="dialog-header">
          <div>
            <h2>Profile</h2>
            <p>{user.email}</p>
          </div>
          <button className="icon-command" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <label className="field-label">
          Code *
          <input value={shortCode} maxLength={3} onChange={(event) => setShortCode(event.target.value)} required />
        </label>

        {error && <div className="notice">{error}</div>}

        <footer className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            <X size={16} />
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={isSaving}>
            <Check size={16} />
            {isSaving ? "Saving" : "Save"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function CalendarPanel({
  view,
  currentUser,
  expandedBookingId,
  onToggleBooking,
  onAssign,
  onAddDocument,
  activityLog,
}: {
  view: CalendarView | null;
  currentUser: User;
  expandedBookingId: string | null;
  onToggleBooking: (id: string) => void;
  onAssign: (booking: CalendarBooking, tripId: string | null) => void;
  onAddDocument: () => void;
  activityLog: ActivityLogEntry[];
}) {
  const [tripFilter, setTripFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "10" | "30" | "all">("all");

  if (!view) {
    return <div className="loading">Loading calendar...</div>;
  }

  const filteredBookings = filterCalendarBookings(view.bookings, tripFilter, dateFilter);
  const visibleTrips = visibleTripsForUser(view.trips, currentUser.id);

  return (
    <section className="calendar-panel" aria-label="Bookings">
      <header className="section-header">
        <div>
          <h2>Calendar</h2>
        </div>
        <button className="icon-command" aria-label="Add booking text" onClick={onAddDocument}>
          <FileUp size={18} />
        </button>
      </header>

      <section className="calendar-filters" aria-label="Calendar filters">
        <label>
          Trip
          <select value={tripFilter} onChange={(event) => setTripFilter(event.target.value)}>
            <option value="all">All trips and inbox</option>
            <option value="inbox">Inbox only</option>
            {visibleTrips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.title} #{trip.tripNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dates
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as "today" | "10" | "30" | "all")}>
            <option value="today">From today</option>
            <option value="10">Last 10 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All dates</option>
          </select>
        </label>
        <span>{filteredBookings.length} shown</span>
      </section>

      <div className="booking-stack">
        {filteredBookings.map((booking) => (
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
                      {visibleTrips.map((trip) => (
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
      <AnalysisProtocol entries={activityLog} />
    </section>
  );
}

function filterCalendarBookings(
  bookings: CalendarBooking[],
  tripFilter: string,
  dateFilter: "today" | "10" | "30" | "all",
): CalendarBooking[] {
  const from = startDateForCalendarFilter(dateFilter);
  return bookings.filter((booking) => {
    if (tripFilter === "inbox" && booking.tripId !== null) return false;
    if (tripFilter !== "all" && tripFilter !== "inbox" && booking.tripId !== tripFilter) return false;
    if (from && booking.startAt && new Date(booking.startAt) < from) return false;
    return true;
  });
}

function startDateForCalendarFilter(dateFilter: "today" | "10" | "30" | "all"): Date | null {
  if (dateFilter === "all") return null;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (dateFilter === "10") start.setUTCDate(start.getUTCDate() - 10);
  if (dateFilter === "30") start.setUTCDate(start.getUTCDate() - 30);
  return start;
}

function visibleTripsForUser(trips: Trip[], userId: string): Trip[] {
  return trips.filter((trip) => trip.ownerUserId === userId || trip.sharedWithUserIds.includes(userId));
}

function AnalysisProtocol({ entries }: { entries: ActivityLogEntry[] }) {
  const analysisEntries = entries.filter((entry) => entry.scope === "documents").slice(0, 12);
  return (
    <section className="analysis-protocol" aria-label="Analysis protocol">
      <header className="section-header compact">
        <div>
          <h2>Protocol</h2>
          <p>{analysisEntries.length} recent analyses</p>
        </div>
      </header>
      <div className="protocol-stack">
        {analysisEntries.length === 0 ? (
          <div className="empty-protocol">No analyses yet.</div>
        ) : (
          analysisEntries.map((entry) => <ProtocolRow key={entry.id} entry={entry} />)
        )}
      </div>
    </section>
  );
}

function ProtocolRow({ entry }: { entry: ActivityLogEntry }) {
  const details = documentActivityDetails(entry.details);
  const result = protocolResult(entry, details.bookingCount);
  return (
    <article className={`protocol-row ${entry.level}`}>
      <time>{formatProtocolTime(entry.timestamp)}</time>
      <span>{entry.level.toUpperCase()}</span>
      <span>{protocolSource(entry)}</span>
      <span>{result}</span>
      <span>{protocolMessage(entry, details.bookingCount)}</span>
    </article>
  );
}

function documentActivityDetails(details: unknown): { bookingCount: number | null } {
  if (!details || typeof details !== "object" || !("bookingCount" in details)) {
    return { bookingCount: null };
  }
  const bookingCount = (details as { bookingCount?: unknown }).bookingCount;
  return { bookingCount: typeof bookingCount === "number" ? bookingCount : null };
}

function formatProtocolTime(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function protocolSource(entry: ActivityLogEntry): string {
  if (entry.documentName === "Clipboard screenshot") return "SCREEN";
  if (entry.documentName === "Texteingabe") return "TEXT";
  return "DOC";
}

function protocolResult(entry: ActivityLogEntry, bookingCount: number | null): string {
  if (entry.level === "error") return "ERROR";
  if (bookingCount === 0) return "NONE";
  if (bookingCount === 1) return "1 BOOKING";
  if (bookingCount !== null) return `${bookingCount} BOOKINGS`;
  return "UNKNOWN";
}

function protocolMessage(entry: ActivityLogEntry, bookingCount: number | null): string {
  if (entry.level === "error") return entry.message;
  if (bookingCount === 0) return "analyzed, no bookings extracted";
  if (bookingCount && bookingCount > 0) return `analyzed and created ${bookingCount} booking${bookingCount === 1 ? "" : "s"}`;
  return entry.message;
}

function TextDocumentDialog({
  trips,
  onClose,
  onRefresh,
  onSubmitted,
}: {
  trips: Trip[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSubmitted: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [tripId, setTripId] = useState("");
  const [screenshot, setScreenshot] = useState<{ dataUrl: string; base64: string; mimeType: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textAreaRef.current?.focus();
  }, []);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !isSubmitting) {
      event.preventDefault();
      onClose();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      const result =
        screenshot !== null
          ? await submitImageDocument({
              base64: screenshot?.base64 ?? "",
              mimeType: screenshot?.mimeType ?? "",
              tripId: tripId || null,
            })
          : await submitTextDocument({ text, tripId: tripId || null });
      if (result.bookings.length === 0) {
        setNotice("No bookings found. The document was not stored.");
        await onRefresh();
        return;
      }
      await onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not analyze document.");
      await onRefresh().catch(() => undefined);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasteEvent(event: ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(event.clipboardData.items).find((candidate) => candidate.type.startsWith("image/"));
    if (!item) return;

    event.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    setError(null);
    setNotice(null);
    setText("");
    setScreenshot(await imageBlobToPayload(file));
  }

  return (
    <div className="modal-backdrop" role="presentation" onKeyDown={handleDialogKeyDown}>
      <form className="document-dialog" onSubmit={handleSubmit}>
        <header className="dialog-header">
          <div>
            <h2>Add document</h2>
            <p>Text or clipboard images are analyzed first and stored when bookings are found.</p>
          </div>
          <button className="icon-command" type="button" aria-label="Close" onClick={onClose} disabled={isSubmitting}>
            <X size={18} />
          </button>
        </header>

        <div className="mode-switch" role="tablist" aria-label="Document input">
          <button type="button" role="tab" aria-selected="true" className="active" disabled={isSubmitting}>
            <FileUp size={16} />
            Text or clipboard
          </button>
          <button type="button" role="tab" aria-selected="false" disabled>
            <ImageIcon size={16} />
            Upload
          </button>
        </div>

        <label className="field-label">
          Trip
          <select value={tripId} onChange={(event) => setTripId(event.target.value)} disabled={isSubmitting}>
            <option value="">No trip yet</option>
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.title} #{trip.tripNumber}
              </option>
            ))}
          </select>
        </label>

        {screenshot ? (
          <div className="field-label">
            Clipboard image
            <div className="screenshot-preview">
              <img src={screenshot.dataUrl} alt="Clipboard screenshot preview" />
            </div>
            <button type="button" className="secondary-button paste-button" onClick={() => setScreenshot(null)} disabled={isSubmitting}>
              <X size={16} />
              Remove image
            </button>
          </div>
        ) : (
          <label className="field-label">
            Text or screenshot *
            <textarea
              ref={textAreaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onPaste={handlePasteEvent}
              required
              rows={10}
              disabled={isSubmitting}
            />
          </label>
        )}

        {isSubmitting && (
          <div className="analysis-status" role="status" aria-live="polite">
            <LoaderCircle size={20} aria-hidden="true" />
            <div>
              <strong>Analyzing document</strong>
              <span>Looking for bookings and dates. This can take a moment.</span>
            </div>
          </div>
        )}

        {notice && <div className="notice">{notice}</div>}
        {error && <div className="notice">{error}</div>}

        <footer className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={isSubmitting}>
            <X size={16} />
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={isSubmitting || (!text.trim() && !screenshot)}>
            {isSubmitting ? <LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> : <Check size={16} />}
            {isSubmitting ? "Analyzing" : "Analyze"}
          </button>
        </footer>
      </form>
    </div>
  );
}

async function imageBlobToPayload(blob: Blob): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type)) {
    throw new Error("Screenshot must be PNG, JPEG, or WebP.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read screenshot."));
    reader.readAsDataURL(blob);
  });
  const [, base64 = ""] = dataUrl.split(",", 2);
  return { dataUrl, base64, mimeType: blob.type };
}

function TripDialog({
  users,
  currentUserId,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  users: User[];
  currentUserId: string;
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
            .filter((user) => user.id !== currentUserId)
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
