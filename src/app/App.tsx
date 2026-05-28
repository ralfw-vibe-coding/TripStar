import {
  CalendarDays,
  Check,
  FileUp,
  Hotel,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  ExternalLink,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  ScrollText,
  Trash2,
  UserCircle,
  TrainFront,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  ClipboardEvent,
  CSSProperties,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ActivityLogEntry, AnalysisJob, CalendarBooking, CalendarView, DailyAllowance, DocumentRecord, Trip, User } from "../domain/model";
import { DAILY_ALLOWANCES, type CountryAllowance } from "./daily-allowances-data";
import {
  assignBookingTrip,
  clearAuthToken,
  createTrip,
  deleteBooking,
  fetchAnalysisJobs,
  fetchActivityLog,
  fetchCalendar,
  fetchCurrentUser,
  fetchDocumentOriginal,
  fetchDocuments,
  getStoredAuthToken,
  logout,
  requestOtp,
  storeAuthToken,
  submitImageDocument,
  submitPdfDocuments,
  submitTextDocument,
  updateBooking,
  updateDocument as updateDocumentApi,
  uploadTripDocument,
  updateProfile,
  updateTrip,
  verifyOtp,
} from "./api";
import { tripColor } from "./trip-colors";
import { ownTripsForUser, sharedTripsForUser } from "./trip-filters";
import { formatTimePointLocal, localDateTimeToInstant } from "../domain/time/booking-time";

interface DocumentOriginalView {
  id: string;
  originalFileName: string | null;
  mimeType: string | null;
  sourceType: string;
  base64: string | null;
  text: string | null;
}

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [view, setView] = useState<CalendarView | null>(null);
  const [analysisJobs, setAnalysisJobs] = useState<AnalysisJob[]>([]);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [documentViewer, setDocumentViewer] = useState<DocumentOriginalView | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [pendingDeleteBookingId, setPendingDeleteBookingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"calendar" | "reports">("calendar");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isDocumentsLoading, setIsDocumentsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTripDialogOpen, setIsTripDialogOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
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

  useEffect(() => {
    if (!currentUser || !analysisJobs.some((job) => job.status === "queued" || job.status === "running")) return;
    const timer = window.setInterval(() => {
      void reloadWorkspace().catch((caught: Error) => setError(caught.message));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [currentUser?.id, analysisJobs]);

  useEffect(() => {
    if (activeSection !== "reports" || !currentUser) return;
    setIsDocumentsLoading(true);
    void fetchDocuments()
      .then(setDocuments)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setIsDocumentsLoading(false));
  }, [activeSection, currentUser?.id]);

  useEffect(() => {
    if (!pendingDeleteBookingId) return;

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target as HTMLElement).closest(".delete-booking-button")) {
        setPendingDeleteBookingId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [pendingDeleteBookingId]);

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

  async function handleTripUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!view || !editingTrip) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const sharedWithUserIds = data.getAll("sharedWithUserIds").map(String);

    setIsCreatingTrip(true);
    setError(null);
    try {
      const trip = await updateTrip(editingTrip.id, {
        title: String(data.get("title")),
        startDate: String(data.get("startDate")),
        endDate: String(data.get("endDate")),
        places: String(data.get("places")),
        sharedWithUserIds,
      });
      setView({
        ...view,
        trips: view.trips.map((candidate) => (candidate.id === trip.id ? trip : candidate)),
        bookings: view.bookings.map((booking) =>
          booking.tripId === trip.id
            ? { ...booking, trip: { id: trip.id, tripNumber: trip.tripNumber, title: trip.title, color: trip.color } }
            : booking,
        ),
      });
      setEditingTrip(null);
      setIsTripDialogOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Trip could not be saved.");
    } finally {
      setIsCreatingTrip(false);
    }
  }

  async function handleAssignBooking(booking: CalendarBooking, tripId: string | null) {
    if (!view) return;
    const trip = view.trips.find((candidate) => candidate.id === tripId) ?? null;
    const allowedParticipantIds = allowedParticipantUsers(trip, view.users, currentUser?.id ?? "").map((user) => user.id);
    const retainedParticipantUserIds = booking.participantUserIds.filter((userId) => allowedParticipantIds.includes(userId));
    const participantUserIds = tripId === null
      ? currentUser
        ? [currentUser.id]
        : []
      : retainedParticipantUserIds.length > 0
        ? retainedParticipantUserIds
        : currentUser && allowedParticipantIds.includes(currentUser.id)
          ? [currentUser.id]
          : [];
    const previousView = view;
    setView({
      ...view,
      bookings: view.bookings.map((candidate) =>
        candidate.id === booking.id
          ? {
              ...candidate,
              tripId,
              participantUserIds,
              trip: trip
                ? {
                    id: trip.id,
                    tripNumber: trip.tripNumber,
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
      if (participantUserIds.length !== booking.participantUserIds.length || participantUserIds.some((id) => !booking.participantUserIds.includes(id))) {
        await updateBooking(booking.id, { participantUserIds });
      }
    } catch (caught) {
      setView(previousView);
      setError(caught instanceof Error ? caught.message : "Booking could not be assigned.");
    }
  }

  async function handleUpdateBookingParticipants(booking: CalendarBooking, participantUserIds: string[]) {
    if (!view) return;
    const previousView = view;
    setView({
      ...view,
      bookings: view.bookings.map((candidate) => (candidate.id === booking.id ? { ...candidate, participantUserIds } : candidate)),
    });
    try {
      await updateBooking(booking.id, { participantUserIds });
    } catch (caught) {
      setView(previousView);
      setError(caught instanceof Error ? caught.message : "Participants could not be updated.");
    }
  }

  async function handleSaveBooking(booking: CalendarBooking, input: Partial<CalendarBooking>) {
    if (!view) return;
    const previousView = view;
    const optimisticBooking = { ...booking, ...input, updatedAt: new Date().toISOString() };
    setView({
      ...view,
      bookings: view.bookings.map((candidate) => (candidate.id === booking.id ? optimisticBooking : candidate)),
    });
    try {
      const saved = await updateBooking(booking.id, input);
      setView((current) =>
        current
          ? {
              ...current,
              bookings: current.bookings.map((candidate) =>
                candidate.id === booking.id ? { ...candidate, ...saved, trip: candidate.trip } : candidate,
              ),
            }
          : current,
      );
    } catch (caught) {
      setView(previousView);
      throw caught;
    }
  }

  async function handleDeleteBooking(booking: CalendarBooking) {
    if (!view) return;
    if (pendingDeleteBookingId !== booking.id) {
      setPendingDeleteBookingId(booking.id);
      return;
    }

    const previousView = view;
    setPendingDeleteBookingId(null);
    setExpandedBookingId((current) => (current === booking.id ? null : current));
    setView({ ...view, bookings: view.bookings.filter((candidate) => candidate.id !== booking.id) });
    try {
      await deleteBooking(booking.id);
      await reloadCalendar();
    } catch (caught) {
      setView(previousView);
      setError(caught instanceof Error ? caught.message : "Booking could not be deleted.");
    }
  }

  async function handleOpenDocument(documentId: string) {
    setError(null);
    try {
      setDocumentViewer(await fetchDocumentOriginal(documentId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Document could not be opened.");
    }
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    clearAuthToken();
    setCurrentUser(null);
    setView(null);
    setAnalysisJobs([]);
    setIsProfileMenuOpen(false);
  }

  async function handleProfileUpdate(user: User) {
    setCurrentUser(user);
    setIsProfileDialogOpen(false);
    setIsProfileMenuOpen(false);
    setView((current) => (current ? { ...current, users: current.users.map((candidate) => (candidate.id === user.id ? user : candidate)) } : current));
  }

  async function handleUploadTripDocument(tripId: string, input: { base64: string; originalFileName: string; mimeType: string }) {
    const doc = await uploadTripDocument({ ...input, tripId });
    setDocuments((docs) => [...docs, doc]);
  }

  async function handleUpdateDocument(docId: string, input: Partial<DocumentRecord>) {
    const previousDocuments = documents;
    setDocuments((docs) => docs.map((d) => d.id === docId ? { ...d, ...input } : d));
    try {
      const updated = await updateDocumentApi(docId, input);
      // Preserve the client-side tripId if the server returned null —
      // the document may be associated via booking, not directly on the record.
      setDocuments((docs) =>
        docs.map((d) =>
          d.id === docId ? { ...updated, tripId: updated.tripId ?? d.tripId } : d,
        ),
      );
    } catch (caught) {
      setDocuments(previousDocuments);
      throw caught;
    }
  }

  async function reloadCalendar() {
    const [calendar, jobs] = await Promise.all([fetchCalendar(), fetchAnalysisJobs()]);
    setView(calendar);
    setAnalysisJobs(jobs);
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
                <strong>{currentUser.shortCode}</strong>
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
              <button
                type="button"
                onClick={() => {
                  setIsActivityLogOpen(true);
                  setIsProfileMenuOpen(false);
                }}
              >
                <ScrollText size={16} />
                Activity log
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
          <TripList
            title="Mine"
            trips={ownTrips}
            onEdit={(trip) => {
              setEditingTrip(trip);
              setIsTripDialogOpen(true);
            }}
          />
          <TripList
            title="Shared"
            trips={sharedTrips}
            onEdit={(trip) => {
              setEditingTrip(trip);
              setIsTripDialogOpen(true);
            }}
          />
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
            onUpdateParticipants={handleUpdateBookingParticipants}
            onSaveBooking={handleSaveBooking}
            onDeleteBooking={handleDeleteBooking}
            pendingDeleteBookingId={pendingDeleteBookingId}
            onClearPendingDelete={() => setPendingDeleteBookingId(null)}
            onAddDocument={() => setIsDocumentDialogOpen(true)}
            onOpenDocument={handleOpenDocument}
            analysisJobs={analysisJobs}
          />
        ) : (
          <ReportsPanel
            trips={view?.trips ?? []}
            documents={documents}
            isDocumentsLoading={isDocumentsLoading}
            onRefresh={reloadCalendar}
            onUpdateDocument={handleUpdateDocument}
            onOpenDocument={handleOpenDocument}
            onUploadDocument={handleUploadTripDocument}
          />
        )}
      </section>

      {isTripDialogOpen && view && (
        <TripDialog
          users={view.users}
          currentUserId={currentUser.id}
          trip={editingTrip}
          onClose={() => {
            setEditingTrip(null);
            setIsTripDialogOpen(false);
          }}
          onSubmit={editingTrip ? handleTripUpdate : handleTripCreate}
          isSubmitting={isCreatingTrip}
        />
      )}

      {isProfileDialogOpen && (
        <ProfileDialog user={currentUser} onClose={() => setIsProfileDialogOpen(false)} onSave={handleProfileUpdate} />
      )}

      {isActivityLogOpen && (
        <ActivityLogDialog analysisJobs={analysisJobs} onClose={() => setIsActivityLogOpen(false)} />
      )}

      {isDocumentDialogOpen && view && (
        <TextDocumentDialog
          trips={visibleTripsForUser(view.trips, currentUser.id)}
          onClose={() => setIsDocumentDialogOpen(false)}
          onRefresh={reloadWorkspace}
          onSubmitted={async () => {
            setIsDocumentDialogOpen(false);
            await reloadWorkspace();
          }}
        />
      )}

      {documentViewer && <DocumentViewer document={documentViewer} onClose={() => setDocumentViewer(null)} />}
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

function TripList({ title, trips, onEdit }: { title: string; trips: Trip[]; onEdit: (trip: Trip) => void }) {
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
              <button className="trip-edit-button" type="button" aria-label={`Edit ${trip.title}`} onClick={() => onEdit(trip)}>
                <Pencil size={14} />
              </button>
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

function ActivityLogDialog({ analysisJobs, onClose }: { analysisJobs: AnalysisJob[]; onClose: () => void }) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      const log = await fetchActivityLog();
      setEntries(log);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Auto-refresh while analysis jobs are running
  useEffect(() => {
    if (!analysisJobs.some((j) => j.status === "queued" || j.status === "running")) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [analysisJobs]);

  const hasRunningJobs = analysisJobs.some((j) => j.status === "queued" || j.status === "running");

  const displayEntries = entries.filter(
    (e) => e.scope === "analysis" || e.scope === "inbox" || e.scope === "documents",
  );

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="activity-log-dialog">
        <header className="dialog-header">
          <div>
            <h2>Activity log</h2>
            <p>{isLoading && entries.length === 0 ? "Loading…" : `${displayEntries.length} entries`}</p>
          </div>
          <div className="dialog-header-actions">
            {hasRunningJobs && <LoaderCircle className="protocol-spinner" size={16} aria-hidden="true" />}
            <button className="icon-command" type="button" aria-label="Refresh" onClick={load} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? "protocol-spinner" : ""} />
            </button>
            <button className="icon-command" type="button" aria-label="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="protocol-stack">
          {isLoading && entries.length === 0 ? (
            <div className="empty-protocol">Loading…</div>
          ) : displayEntries.length === 0 ? (
            <div className="empty-protocol">No entries yet.</div>
          ) : (
            displayEntries.map((entry) => <ProtocolRow key={entry.id} entry={entry} />)
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarPanel({
  view,
  currentUser,
  expandedBookingId,
  onToggleBooking,
  onAssign,
  onUpdateParticipants,
  onSaveBooking,
  onDeleteBooking,
  pendingDeleteBookingId,
  onClearPendingDelete,
  onAddDocument,
  onOpenDocument,
  analysisJobs,
}: {
  view: CalendarView | null;
  currentUser: User;
  expandedBookingId: string | null;
  onToggleBooking: (id: string) => void;
  onAssign: (booking: CalendarBooking, tripId: string | null) => void;
  onUpdateParticipants: (booking: CalendarBooking, participantUserIds: string[]) => void;
  onSaveBooking: (booking: CalendarBooking, input: Partial<CalendarBooking>) => Promise<void>;
  onDeleteBooking: (booking: CalendarBooking) => void;
  pendingDeleteBookingId: string | null;
  onClearPendingDelete: () => void;
  onAddDocument: () => void;
  onOpenDocument: (documentId: string) => void;
  analysisJobs: AnalysisJob[];
}) {
  const [tripFilter, setTripFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "10" | "30" | "all">("all");

  if (!view) {
    return <div className="loading">Loading calendar...</div>;
  }

  const visibleTrips = visibleTripsForUser(view.trips, currentUser.id);
  const filterUsers = calendarFilterUsers(view.users, visibleTrips, currentUser.id);
  const filteredBookings = filterCalendarBookings(view.bookings, tripFilter, userFilter, dateFilter);
  const bookingGroups = groupBookingsByDay(filteredBookings);

  return (
    <section
      className="calendar-panel"
      aria-label="Bookings"
      onClickCapture={(event) => {
        if (pendingDeleteBookingId && !(event.target as HTMLElement).closest(".delete-booking-button")) {
          onClearPendingDelete();
        }
      }}
    >
      <header className="section-header">
        <div>
          <h2>Calendar</h2>
        </div>
        <button className="icon-command" aria-label="Add booking text" onClick={onAddDocument}>
          <FileUp size={18} />
        </button>
      </header>

      <AnalysisProgress jobs={analysisJobs} />

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
          User
          <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
            <option value="all">All related users</option>
            {filterUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.shortCode}
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
        {bookingGroups.map((group, index) => (
          <div className="booking-day-with-gap" key={group.key}>
            {index > 0 && <DayGap previousKey={bookingGroups[index - 1].key} currentKey={group.key} />}
            <section className="booking-day-group">
              <h3>{group.label}</h3>
              <div className="booking-day-stack">
                {group.bookings.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    expandedBookingId={expandedBookingId}
                    onToggleBooking={onToggleBooking}
                    onAssign={onAssign}
                    onUpdateParticipants={onUpdateParticipants}
                    onSaveBooking={onSaveBooking}
                    onDeleteBooking={onDeleteBooking}
                    isDeletePending={pendingDeleteBookingId === booking.id}
                    onClearPendingDelete={onClearPendingDelete}
                    onOpenDocument={onOpenDocument}
                    visibleTrips={visibleTrips}
                    users={view.users}
                    currentUserId={currentUser.id}
                  />
                ))}
              </div>
            </section>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalysisProgress({ jobs }: { jobs: AnalysisJob[] }) {
  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running");
  if (activeJobs.length === 0) return null;

  const runningCount = activeJobs.filter((job) => job.status === "running").length;
  const queuedCount = activeJobs.length - runningCount;
  return (
    <section className="analysis-progress" role="status" aria-live="polite">
      <div>
        <strong>Analyzing documents</strong>
        <span>
          {runningCount > 0 ? `${runningCount} running` : "Starting"}
          {queuedCount > 0 ? `, ${queuedCount} queued` : ""}
        </span>
      </div>
      <div className="analysis-progress-track" aria-hidden="true">
        <span />
      </div>
    </section>
  );
}

function DayGap({ previousKey, currentKey }: { previousKey: string; currentKey: string }) {
  const days = dayGap(previousKey, currentKey);
  if (days <= 1) return null;
  const ratio = Math.min(days / 180, 1);
  return (
    <div
      className="day-gap"
      aria-hidden="true"
      style={{
        "--gap-width": `${Math.round(30 + ratio * 70)}%`,
        "--gap-height": `${Math.round(4 + ratio * 24)}px`,
      } as CSSProperties}
    />
  );
}

function BookingCard({
  booking,
  expandedBookingId,
  onToggleBooking,
  onAssign,
  onUpdateParticipants,
  onSaveBooking,
  onDeleteBooking,
  isDeletePending,
  onClearPendingDelete,
  onOpenDocument,
  visibleTrips,
  users,
  currentUserId,
}: {
  booking: CalendarBooking;
  expandedBookingId: string | null;
  onToggleBooking: (id: string) => void;
  onAssign: (booking: CalendarBooking, tripId: string | null) => void;
  onUpdateParticipants: (booking: CalendarBooking, participantUserIds: string[]) => void;
  onSaveBooking: (booking: CalendarBooking, input: Partial<CalendarBooking>) => Promise<void>;
  onDeleteBooking: (booking: CalendarBooking) => void;
  isDeletePending: boolean;
  onClearPendingDelete: () => void;
  onOpenDocument: (documentId: string) => void;
  visibleTrips: Trip[];
  users: User[];
  currentUserId: string;
}) {
  const fullTrip = visibleTrips.find((trip) => trip.id === booking.tripId) ?? null;
  const allowedUsers = allowedParticipantUsers(fullTrip, users, currentUserId);
  const startPoint = firstTimePoint(booking, ["departure", "start", "check_in"]);
  const endPoint = firstTimePoint(booking, ["arrival", "end", "check_out"]);
  const [draft, setDraft] = useState(() => bookingDraftFromBooking(booking));
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const draftDirty = isBookingDraftDirty(booking, draft);

  useEffect(() => {
    setDraft(bookingDraftFromBooking(booking));
    setDraftError(null);
  }, [
    booking.id,
    booking.title,
    booking.type,
    booking.startAt,
    booking.endAt,
    booking.fromText,
    booking.toText,
    booking.operator,
    booking.serviceIdentifier,
    booking.details,
  ]);

  async function saveDraft() {
    setIsSavingDraft(true);
    setDraftError(null);
    try {
      await onSaveBooking(booking, bookingInputFromDraft(draft, booking));
    } catch (caught) {
      setDraftError(caught instanceof Error ? caught.message : "Booking could not be saved.");
    } finally {
      setIsSavingDraft(false);
    }
  }

  return (
    <article
      className={`booking-card ${expandedBookingId === booking.id ? "expanded" : ""}`}
      style={{ borderLeftColor: booking.trip ? tripColorForBooking(booking.trip) : "#cfd8df" }}
    >
      <div
        role="button"
        tabIndex={0}
        className="booking-summary"
        onClick={() => {
          onClearPendingDelete();
          onToggleBooking(booking.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClearPendingDelete();
            onToggleBooking(booking.id);
          }
        }}
      >
        <span className="booking-icon">{iconForType(booking.type)}</span>
        <span className="booking-main">
          <strong>{bookingHeaderTitle(booking)}</strong>
          <span>{bookingHeaderMeta(booking)}</span>
          {bookingRoute(booking) && <span>{bookingRoute(booking)}</span>}
        </span>
        <span className="booking-chips">
          {flightSearchUrl(booking) && (
            <a
              className="flight-link"
              href={flightSearchUrl(booking) ?? undefined}
              target="_blank"
              rel="noreferrer"
              aria-label="Open flight data in Google"
              onClick={(event) => event.stopPropagation()}
            >
              <Plane size={15} />
              <ExternalLink size={13} />
            </a>
          )}
          {booking.trip && <span className="booking-trip">{booking.trip.title} #{booking.trip.tripNumber}</span>}
          {booking.status === "inbox" && <span className="status-pill">Inbox</span>}
          <ParticipantChips users={usersForIds(users, booking.participantUserIds)} />
          <span
            role="button"
            tabIndex={0}
            className={`delete-booking-button ${isDeletePending ? "confirm" : ""}`}
            aria-label={isDeletePending ? `Confirm delete ${booking.title}` : `Delete ${booking.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onDeleteBooking(booking);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onDeleteBooking(booking);
              }
            }}
          >
            {isDeletePending ? "?" : <Trash2 size={14} />}
          </span>
        </span>
      </div>

      {expandedBookingId === booking.id && (
        <div className="booking-details">
          <div className="booking-edit-grid">
            <label className="field-label">
              Type *
              <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as CalendarBooking["type"] })}>
                <option value="flight">Flight</option>
                <option value="lodging">Lodging</option>
                <option value="train">Train</option>
                <option value="rental_car">Rental car</option>
                <option value="ferry">Ferry</option>
                <option value="event">Event</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field-label booking-edit-title">
              Title *
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label className="field-label">
              Start
              <input
                type="datetime-local"
                value={draft.startAt}
                onChange={(event) => setDraft({ ...draft, startAt: event.target.value })}
              />
              {startPoint && <span className="field-tz">{formatTimeZoneLabel(startPoint.timeZone)}</span>}
            </label>
            <label className="field-label">
              End
              <input type="datetime-local" value={draft.endAt} onChange={(event) => setDraft({ ...draft, endAt: event.target.value })} />
              {endPoint && <span className="field-tz">{formatTimeZoneLabel(endPoint.timeZone)}</span>}
            </label>
            <label className="field-label">
              From
              <input value={draft.fromText} onChange={(event) => setDraft({ ...draft, fromText: event.target.value })} />
            </label>
            <label className="field-label">
              To
              <input value={draft.toText} onChange={(event) => setDraft({ ...draft, toText: event.target.value })} />
            </label>
            <label className="field-label">
              Operator
              <input value={draft.operator} onChange={(event) => setDraft({ ...draft, operator: event.target.value })} />
            </label>
            <label className="field-label">
              Reference
              <input value={draft.serviceIdentifier} onChange={(event) => setDraft({ ...draft, serviceIdentifier: event.target.value })} />
            </label>
          </div>

          <section className="booking-detail-text">
            <h3>Details</h3>
            <textarea value={draft.details} rows={6} onChange={(event) => setDraft({ ...draft, details: event.target.value })} />
          </section>

          <ParticipantPicker
            allowedUsers={allowedUsers}
            selectedUserIds={booking.participantUserIds}
            onChange={(participantUserIds) => onUpdateParticipants(booking, participantUserIds)}
          />

          <div className="detail-actions">
            <div className="booking-save-area">
              {draftError && <div className="inline-error">{draftError}</div>}
              <button type="button" className="primary-button" onClick={saveDraft} disabled={!draftDirty || isSavingDraft}>
                {isSavingDraft ? <LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> : <Check size={16} />}
                {isSavingDraft ? "Saving" : draftDirty ? "Save changes" : "Saved"}
              </button>
            </div>
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
            {booking.sourceDocumentId && (
              <button type="button" className="secondary-button document-link" onClick={() => onOpenDocument(booking.sourceDocumentId!)}>
                <FileUp size={16} />
                Original document
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function ParticipantChips({ users }: { users: User[] }) {
  if (users.length === 0) return <span className="participant-empty">No participants</span>;
  return (
    <span className="participant-chips">
      {users.map((user) => (
        <span className="participant-chip" key={user.id}>
          {user.shortCode}
        </span>
      ))}
    </span>
  );
}

function ParticipantPicker({
  allowedUsers,
  selectedUserIds,
  onChange,
}: {
  allowedUsers: User[];
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
}) {
  return (
    <section className="participant-picker">
      <h3>Participants</h3>
      <div>
        {allowedUsers.map((user) => {
          const selected = selectedUserIds.includes(user.id);
          return (
            <button
              type="button"
              className={`participant-choice ${selected ? "selected" : ""}`}
              key={user.id}
              onClick={() => {
                const next = selected ? selectedUserIds.filter((userId) => userId !== user.id) : [...selectedUserIds, user.id];
                onChange(next);
              }}
            >
              {user.shortCode}
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface BookingDraft {
  type: CalendarBooking["type"];
  title: string;
  startAt: string;
  endAt: string;
  fromText: string;
  toText: string;
  operator: string;
  serviceIdentifier: string;
  details: string;
}

function bookingDraftFromBooking(booking: CalendarBooking): BookingDraft {
  const startPoint = firstTimePoint(booking, ["departure", "start", "check_in"]);
  const endPoint = firstTimePoint(booking, ["arrival", "end", "check_out"]);
  return {
    type: booking.type,
    title: booking.title,
    startAt: startPoint?.localDateTime ?? toDateTimeLocalValue(booking.startAt),
    endAt: endPoint?.localDateTime ?? toDateTimeLocalValue(booking.endAt),
    fromText: booking.fromText ?? "",
    toText: booking.toText ?? "",
    operator: booking.operator ?? "",
    serviceIdentifier: booking.serviceIdentifier ?? "",
    details: booking.details,
  };
}

function bookingInputFromDraft(draft: BookingDraft, booking: CalendarBooking): Partial<CalendarBooking> {
  const startPoint = firstTimePoint(booking, ["departure", "start", "check_in"]);
  const endPoint = firstTimePoint(booking, ["arrival", "end", "check_out"]);
  const newStartPoint = resolveUpdatedTimePoint(draft.startAt, startPoint);
  const newEndPoint = resolveUpdatedTimePoint(draft.endAt, endPoint);
  const timePoints = booking.timePoints
    .map((p) => (p === startPoint ? newStartPoint : p === endPoint ? newEndPoint : p))
    .filter((p): p is CalendarBooking["timePoints"][0] => p !== null);
  return {
    type: draft.type,
    title: draft.title.trim() || "Untitled booking",
    startAt: resolveInstant(draft.startAt, startPoint),
    endAt: resolveInstant(draft.endAt, endPoint),
    timePoints,
    fromText: nullableText(draft.fromText),
    toText: nullableText(draft.toText),
    operator: nullableText(draft.operator),
    serviceIdentifier: nullableText(draft.serviceIdentifier),
    details: draft.details.trim(),
  };
}

function resolveInstant(draftValue: string, timePoint: CalendarBooking["timePoints"][0] | null): string | null {
  if (!draftValue) return null;
  if (timePoint) {
    if (draftValue === timePoint.localDateTime) return timePoint.instant;
    try { return localDateTimeToInstant(draftValue, timePoint.timeZone); } catch { /* fall through */ }
  }
  return fromDateTimeLocalValue(draftValue);
}

function resolveUpdatedTimePoint(
  draftValue: string,
  timePoint: CalendarBooking["timePoints"][0] | null,
): CalendarBooking["timePoints"][0] | null {
  if (!timePoint) return null;
  if (!draftValue || draftValue === timePoint.localDateTime) return timePoint;
  try {
    const instant = localDateTimeToInstant(draftValue, timePoint.timeZone);
    return { ...timePoint, localDateTime: draftValue, instant };
  } catch {
    return null;
  }
}

function isBookingDraftDirty(booking: CalendarBooking, draft: BookingDraft): boolean {
  const input = bookingInputFromDraft(draft, booking);
  return (
    input.type !== booking.type ||
    input.title !== booking.title ||
    input.startAt !== booking.startAt ||
    input.endAt !== booking.endAt ||
    input.fromText !== booking.fromText ||
    input.toText !== booking.toText ||
    input.operator !== booking.operator ||
    input.serviceIdentifier !== booking.serviceIdentifier ||
    input.details !== booking.details
  );
}

function formatTimeZoneLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return `${timeZone} - ${offset.replace("GMT", "UTC")}`;
  } catch {
    return timeZone;
  }
}

function firstTimePoint(booking: CalendarBooking, labels: string[]): CalendarBooking["timePoints"][0] | null {
  for (const label of labels) {
    const point = booking.timePoints.find((p) => p.label === label);
    if (point) return point;
  }
  return null;
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function filterCalendarBookings(
  bookings: CalendarBooking[],
  tripFilter: string,
  userFilter: string,
  dateFilter: "today" | "10" | "30" | "all",
): CalendarBooking[] {
  const from = startDateForCalendarFilter(dateFilter);
  return bookings.filter((booking) => {
    if (tripFilter === "inbox" && booking.tripId !== null) return false;
    if (tripFilter !== "all" && tripFilter !== "inbox" && booking.tripId !== tripFilter) return false;
    if (userFilter !== "all" && !booking.participantUserIds.includes(userFilter)) return false;
    if (from && booking.startAt && new Date(booking.startAt) < from) return false;
    return true;
  });
}

function startDateForCalendarFilter(dateFilter: "today" | "10" | "30" | "all"): Date | null {
  if (dateFilter === "all") return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dateFilter === "10") start.setDate(start.getDate() - 10);
  if (dateFilter === "30") start.setDate(start.getDate() - 30);
  return start;
}

function groupBookingsByDay(bookings: CalendarBooking[]): Array<{ key: string; label: string; bookings: CalendarBooking[] }> {
  const groups = new Map<string, CalendarBooking[]>();
  for (const booking of bookings) {
    const key = booking.startAt ? localDayKey(new Date(booking.startAt)) : "no-date";
    groups.set(key, [...(groups.get(key) ?? []), booking]);
  }
  return Array.from(groups.entries()).map(([key, bookings]) => ({
    key,
    label: key === "no-date" ? "No date" : formatDayGroupLabel(key),
    bookings,
  }));
}

function formatDayGroupLabel(dateKey: string): string {
  const date = localDateFromKey(dateKey);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function dayGap(previousKey: string, currentKey: string): number {
  if (previousKey === "no-date" || currentKey === "no-date") return 0;
  const previous = localDateFromKey(previousKey).getTime();
  const current = localDateFromKey(currentKey).getTime();
  return Math.max(0, Math.round((current - previous) / 86_400_000));
}

function localDayKey(date: Date): string {
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function localDateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function visibleTripsForUser(trips: Trip[], userId: string): Trip[] {
  return trips.filter((trip) => trip.ownerUserId === userId || trip.sharedWithUserIds.includes(userId));
}

function calendarFilterUsers(users: User[], trips: Trip[], currentUserId: string): User[] {
  const userIds = new Set<string>([currentUserId]);
  for (const trip of trips) {
    userIds.add(trip.ownerUserId);
    for (const sharedUserId of trip.sharedWithUserIds) {
      userIds.add(sharedUserId);
    }
  }
  return users.filter((user) => userIds.has(user.id));
}

function allowedParticipantUsers(
  trip: Pick<Trip, "ownerUserId" | "sharedWithUserIds"> | null,
  users: User[],
  currentUserId: string,
): User[] {
  if (!trip) {
    return users.filter((user) => user.id === currentUserId);
  }
  const allowedIds = new Set([trip.ownerUserId, ...trip.sharedWithUserIds]);
  return users.filter((user) => allowedIds.has(user.id));
}

function usersForIds(users: User[], userIds: string[]): User[] {
  const byId = new Map(users.map((user) => [user.id, user]));
  return userIds.flatMap((userId) => {
    const user = byId.get(userId);
    return user ? [user] : [];
  });
}

function AnalysisProtocol({ entries, jobs }: { entries: ActivityLogEntry[]; jobs: AnalysisJob[] }) {
  const stagedEntries = entries.filter((entry) => entry.scope === "analysis" || entry.scope === "inbox");
  const fallbackEntries = entries.filter((entry) => entry.scope === "documents" || entry.scope === "inbox");
  const analysisEntries = (stagedEntries.length > 0 ? stagedEntries : fallbackEntries).slice(0, 18);
  const hasRunningJobs = jobs.some((job) => job.status === "queued" || job.status === "running");
  return (
    <section className="analysis-protocol" aria-label="Analysis log">
      <header className="section-header compact">
        <div>
          <h2>Log</h2>
          <p>{analysisEntries.length} recent entries</p>
        </div>
        {hasRunningJobs && <LoaderCircle className="protocol-spinner" size={16} aria-hidden="true" />}
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
  const result = protocolResult(entry, details.bookingCount, details.status);
  return (
    <article className={`protocol-row ${entry.level} ${details.status ?? ""}`}>
      <time>{formatProtocolTime(entry.timestamp)}</time>
      <span>{protocolLevel(entry, details.status)}</span>
      <span>{protocolSource(entry, details.sourceType)}</span>
      <span>{result}</span>
      <span>{protocolMessage(entry, details.bookingCount)}</span>
    </article>
  );
}

function documentActivityDetails(details: unknown): {
  bookingCount: number | null;
  status: AnalysisJob["status"] | null;
  sourceType: AnalysisJob["sourceType"] | null;
} {
  if (!details || typeof details !== "object") {
    return { bookingCount: null, status: null, sourceType: null };
  }
  const data = details as { bookingCount?: unknown; status?: unknown; sourceType?: unknown };
  const bookingCount = data.bookingCount;
  const status = typeof data.status === "string" && ["queued", "running", "done", "failed"].includes(data.status) ? data.status : null;
  const sourceType =
    typeof data.sourceType === "string" && ["text", "screenshot", "pdf"].includes(data.sourceType) ? data.sourceType : null;
  return {
    bookingCount: typeof bookingCount === "number" ? bookingCount : null,
    status: status as AnalysisJob["status"] | null,
    sourceType: sourceType as AnalysisJob["sourceType"] | null,
  };
}

function formatProtocolTime(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function protocolLevel(entry: ActivityLogEntry, status: AnalysisJob["status"] | null): string {
  return status ? status.toUpperCase() : entry.level.toUpperCase();
}

function protocolSource(entry: ActivityLogEntry, sourceType: AnalysisJob["sourceType"] | null): string {
  if (sourceType === "screenshot") return "SCREEN";
  if (sourceType === "text") return "TEXT";
  if (sourceType === "pdf") return "PDF";
  if (entry.scope === "inbox") return "EMAIL";
  if (entry.documentName === "Clipboard screenshot") return "SCREEN";
  if (entry.documentName === "Texteingabe") return "TEXT";
  return "DOC";
}

function protocolResult(entry: ActivityLogEntry, bookingCount: number | null, status: AnalysisJob["status"] | null): string {
  if (status === "queued") return "WAITING";
  if (status === "running") return "RUNNING";
  if (status === "failed") return "ERROR";
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
  const [inputMode, setInputMode] = useState<"upload" | "manual">("upload");
  const [pdfFiles, setPdfFiles] = useState<Array<{ name: string; size: number; base64: string }>>([]);
  const [isPdfDragActive, setIsPdfDragActive] = useState(false);
  const [screenshot, setScreenshot] = useState<{ dataUrl: string; base64: string; mimeType: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (inputMode === "manual") textAreaRef.current?.focus();
  }, [inputMode]);

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
      if (inputMode === "upload") {
        await submitPdfDocuments({
          documents: pdfFiles.map((file) => ({ base64: file.base64, originalFileName: file.name })),
          tripId: tripId || null,
        });
      } else if (screenshot !== null) {
        await submitImageDocument({
          base64: screenshot?.base64 ?? "",
          mimeType: screenshot?.mimeType ?? "",
          tripId: tripId || null,
        });
      } else {
        await submitTextDocument({ text, tripId: tripId || null });
      }
      await onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit document.");
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

  async function handlePdfFilesChange(event: ChangeEvent<HTMLInputElement>) {
    await acceptPdfFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  }

  async function acceptPdfFiles(files: File[]) {
    setError(null);
    setNotice(null);
    if (files.some((file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
      setError("Only PDF documents are accepted.");
      setPdfFiles([]);
      return;
    }
    const acceptedFiles = await Promise.all(files.map(pdfFileToPayload));
    setPdfFiles((current) => {
      const byIdentity = new Map(current.map((file) => [`${file.name}:${file.size}`, file]));
      for (const file of acceptedFiles) {
        byIdentity.set(`${file.name}:${file.size}`, file);
      }
      return [...byIdentity.values()];
    });
  }

  async function handlePdfDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsPdfDragActive(false);
    await acceptPdfFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="modal-backdrop" role="presentation" onKeyDown={handleDialogKeyDown}>
      <form className="document-dialog" onSubmit={handleSubmit}>
        <header className="dialog-header">
          <div>
            <h2>Add document</h2>
            <p>Upload PDFs or analyze pasted text and clipboard images.</p>
          </div>
          <button className="icon-command" type="button" aria-label="Close" onClick={onClose} disabled={isSubmitting}>
            <X size={18} />
          </button>
        </header>

        <div className="mode-switch" role="tablist" aria-label="Document input">
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === "upload"}
            className={inputMode === "upload" ? "active" : ""}
            onClick={() => setInputMode("upload")}
            disabled={isSubmitting}
          >
            <ImageIcon size={16} />
            Upload
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === "manual"}
            className={inputMode === "manual" ? "active" : ""}
            onClick={() => setInputMode("manual")}
            disabled={isSubmitting}
          >
            <FileUp size={16} />
            Text or clipboard
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

        {inputMode === "upload" ? (
          <label
            className={`pdf-dropzone ${isPdfDragActive ? "active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsPdfDragActive(true);
            }}
            onDragLeave={() => setIsPdfDragActive(false)}
            onDrop={handlePdfDrop}
          >
            <input type="file" accept=".pdf,application/pdf" multiple onChange={handlePdfFilesChange} disabled={isSubmitting} />
            <FileUp size={34} aria-hidden="true" />
            <strong>Drop PDF documents here</strong>
            <span>or click to choose one or more files</span>
            {pdfFiles.length > 0 && (
              <div className="pdf-file-list">
                <strong>{pdfFiles.length === 1 ? "1 PDF selected" : `${pdfFiles.length} PDFs selected`}</strong>
                {pdfFiles.map((file) => (
                  <span key={`${file.name}:${file.size}`}>{file.name}</span>
                ))}
              </div>
            )}
          </label>
        ) : screenshot ? (
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
          <button
            type="submit"
            className="primary-button"
            disabled={isSubmitting || (inputMode === "upload" ? pdfFiles.length === 0 : !text.trim() && !screenshot)}
          >
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

async function pdfFileToPayload(file: File): Promise<{ name: string; size: number; base64: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read PDF document."));
    reader.readAsDataURL(file);
  });
  const [, base64 = ""] = dataUrl.split(",", 2);
  return { name: file.name, size: file.size, base64 };
}

function TripDialog({
  users,
  currentUserId,
  trip,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  users: User[];
  currentUserId: string;
  trip: Trip | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
}) {
  const isEditing = trip !== null;
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="trip-dialog" onSubmit={onSubmit}>
        <header className="dialog-header">
          <div>
            <h2>{isEditing ? "Edit trip" : "Create trip"}</h2>
            <p>{isEditing ? `#${trip.tripNumber}` : "Details can be changed later."}</p>
          </div>
          <button className="icon-command" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <label className="field-label">
          Title
          <input name="title" placeholder="Trip number if empty" defaultValue={trip?.title ?? ""} />
        </label>

        <div className="date-grid">
          <label className="field-label">
            Starting date *
            <input name="startDate" type="date" required defaultValue={trip?.startDate ?? ""} onChange={fillEndDateIfEmpty} />
          </label>
          <label className="field-label">
            End date *
            <input name="endDate" type="date" required defaultValue={trip?.endDate ?? ""} />
          </label>
        </div>

        <label className="field-label">
          Places *
          <input name="places" placeholder="San Francisco, Palo Alto" required defaultValue={trip?.places ?? ""} />
        </label>

        <fieldset className="user-picker">
          <legend>Share with</legend>
          {users
            .filter((user) => user.id !== currentUserId)
            .map((user) => (
              <label key={user.id}>
                <input
                  type="checkbox"
                  name="sharedWithUserIds"
                  value={user.id}
                  defaultChecked={trip?.sharedWithUserIds.includes(user.id) ?? false}
                />
                <span>{user.shortCode}</span>
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
            {isSubmitting ? "Saving" : isEditing ? "Save" : "Create"}
          </button>
        </footer>
      </form>
    </div>
  );
}

// ─── Reports Panel ───────────────────────────────────────────────────────────

function ReportsPanel({
  trips,
  documents,
  isDocumentsLoading,
  onRefresh,
  onUpdateDocument,
  onOpenDocument,
  onUploadDocument,
}: {
  trips: Trip[];
  documents: DocumentRecord[];
  isDocumentsLoading: boolean;
  onRefresh: () => void;
  onUpdateDocument: (docId: string, input: Partial<DocumentRecord>) => Promise<void>;
  onOpenDocument: (documentId: string) => void;
  onUploadDocument: (tripId: string, input: { base64: string; originalFileName: string; mimeType: string }) => Promise<void>;
}) {
  return (
    <section className="reports">
      <header className="section-header">
        <div>
          <h2>Reports</h2>
          <p>Daily allowances and receipts per trip</p>
        </div>
      </header>
      <div className="report-list">
        {trips.length === 0 && <p className="report-empty">No trips yet.</p>}
        {trips.map((trip) => (
          <TripReport
            key={trip.id}
            trip={trip}
            documents={documents.filter((d) => d.tripId === trip.id)}
            isDocumentsLoading={isDocumentsLoading}
            onRefresh={onRefresh}
            onUpdateDocument={onUpdateDocument}
            onOpenDocument={onOpenDocument}
            onUploadDocument={onUploadDocument}
          />
        ))}
      </div>
    </section>
  );
}

function tripDays(trip: Trip): string[] {
  if (!trip.startDate || !trip.endDate) return [];
  const days: string[] = [];
  // Use UTC dates to avoid DST issues
  const [sy, sm, sd] = trip.startDate.split("-").map(Number);
  const [ey, em, ed] = trip.endDate.split("-").map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  const current = new Date(start);
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function formatDayLabel(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${day}.${month}.`;
}

function TripReport({
  trip,
  documents,
  isDocumentsLoading,
  onRefresh: _onRefresh,
  onUpdateDocument,
  onOpenDocument,
  onUploadDocument,
}: {
  trip: Trip;
  documents: DocumentRecord[];
  isDocumentsLoading: boolean;
  onRefresh: () => void;
  onUpdateDocument: (docId: string, input: Partial<DocumentRecord>) => Promise<void>;
  onOpenDocument: (documentId: string) => void;
  onUploadDocument: (tripId: string, input: { base64: string; originalFileName: string; mimeType: string }) => Promise<void>;
}) {
  const days = tripDays(trip);

  // Local copy for optimistic updates — synced from props when server data arrives
  const [localAllowances, setLocalAllowances] = useState<DailyAllowance[]>(() => trip.dailyAllowances);
  useEffect(() => { setLocalAllowances(trip.dailyAllowances); }, [trip.dailyAllowances]);

  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [lastClickedDay, setLastClickedDay] = useState<string | null>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [factor, setFactor] = useState<1 | 2>(2);

  const allowanceMap = useMemo(
    () => new Map(localAllowances.map((a) => [a.date, a])),
    [localAllowances],
  );
  // Only sum allowances for days currently in the trip's date range
  const allowancesTotal = useMemo(
    () => days.reduce((sum, date) => sum + (allowanceMap.get(date)?.dailyAllowanceEuro ?? 0), 0),
    [days, allowanceMap],
  );

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return DAILY_ALLOWANCES;
    return DAILY_ALLOWANCES.filter(
      (c) => c.country.toLowerCase().includes(q) || c.abbr.toLowerCase().includes(q),
    );
  }, [countrySearch]);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUploadFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });
      const [, base64 = ""] = dataUrl.split(",", 2);
      await onUploadDocument(trip.id, { base64, originalFileName: file.name, mimeType: file.type });
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  const receipts = documents.filter((d) => d.isReceipt);
  const reimbursableTotal = receipts
    .filter((d) => d.receiptType === "reimbursable")
    .reduce((sum, d) => sum + (d.receiptAmount ?? 0), 0);
  const reportOnlyTotal = receipts
    .filter((d) => d.receiptType === "report_only")
    .reduce((sum, d) => sum + (d.receiptAmount ?? 0), 0);
  const grandTotal = allowancesTotal + reimbursableTotal;

  function handleDayClick(date: string, e: MouseEvent) {
    e.stopPropagation();
    if (e.shiftKey && lastClickedDay) {
      const idxA = days.indexOf(lastClickedDay);
      const idxB = days.indexOf(date);
      const [from, to] = idxA <= idxB ? [idxA, idxB] : [idxB, idxA];
      setSelectedDays(new Set(days.slice(from, to + 1)));
    } else {
      setSelectedDays((prev) => {
        const next = new Set(prev);
        if (next.has(date)) next.delete(date);
        else next.add(date);
        return next;
      });
      setLastClickedDay(date);
    }
  }

  // c === null means "remove allowance for selected days"
  function applyCountry(c: CountryAllowance | null) {
    const newAllowances: DailyAllowance[] = [];
    for (const date of days) {
      if (selectedDays.has(date)) {
        if (c !== null) {
          newAllowances.push({ date, country: c.country, countryAbbr: c.abbr, dailyAllowanceEuro: c.baseEuro * factor, factor });
        }
        // c === null → skip (removes the entry)
      } else {
        const existing = allowanceMap.get(date);
        if (existing?.country) newAllowances.push(existing);
      }
    }

    // Optimistic: update UI instantly
    setLocalAllowances(newAllowances);
    setSelectedDays(new Set());
    setLastClickedDay(null);
    setCountrySearch("");

    // Persist in background — revert on failure
    void updateTrip(trip.id, { dailyAllowances: newAllowances }).catch(() => {
      setLocalAllowances(trip.dailyAllowances);
    });
  }

  return (
    <article className="trip-report" style={{ borderLeftColor: tripColor(trip) }} onClick={() => setSelectedDays(new Set())}>
      <header className="trip-report-header">
        <div className="trip-report-title">
          <span className="trip-report-number">#{trip.tripNumber}</span>
          <strong className="trip-report-name">{trip.title}</strong>
          <span className="trip-report-dates">
            {trip.startDate} – {trip.endDate}
          </span>
        </div>
      </header>

      <div className="days-grid">
        {days.map((date, idx) => {
          const allowance = allowanceMap.get(date);
          const isSet = !!(allowance?.country);
          const isSelected = selectedDays.has(date);
          return (
            <button
              key={date}
              className={`day-tile${isSet ? " set" : ""}${isSelected ? " selected" : ""}`}
              onClick={(e) => handleDayClick(date, e)}
            >
              <span className="day-tile-top">
                <span className="day-index">{String(idx + 1).padStart(2, "0")}</span>
                <span className="day-date">{formatDayLabel(date)}</span>
              </span>
              <span className="day-allowance">
                {isSet ? `${allowance!.countryAbbr} ${allowance!.dailyAllowanceEuro}€` : "--"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="trip-report-footer">
        <strong className="trip-total">Total daily allowances: {allowancesTotal}€</strong>
      </div>

      {selectedDays.size > 0 && (
        <div className="country-picker" onClick={(e) => e.stopPropagation()}>
          <div className="country-picker-controls">
            <input
              className="country-search"
              type="text"
              placeholder="Country or abbreviation"
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              autoFocus
            />
            <div className="factor-toggle">
              <button className={factor === 1 ? "active" : ""} onClick={() => setFactor(1)}>1x</button>
              <button className={factor === 2 ? "active" : ""} onClick={() => setFactor(2)}>2x</button>
            </div>
          </div>
          <ul className="country-list">
            <li>
              <button className="country-item country-item-remove" onClick={() => applyCountry(null)}>
                <span className="country-name">— Remove allowance</span>
              </button>
            </li>
            {filteredCountries.map((c) => (
              <li key={c.abbr}>
                <button className="country-item" onClick={() => applyCountry(c)}>
                  <span className="country-name">{c.country}</span>
                  <span className="country-abbr">{c.abbr}</span>
                  <span className="country-amount">{c.baseEuro * factor}€</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Documents section */}
      <div className="receipt-section" onClick={(e) => e.stopPropagation()}>

        {/* ── Payment receipts ── */}
        <h3 className="receipt-section-title">Payment receipts</h3>
        {isDocumentsLoading && documents.length === 0 ? (
          <p className="muted-small">Loading documents…</p>
        ) : receipts.length === 0 ? (
          <p className="muted-small">No payment receipts yet — mark a booking document below as a payment receipt.</p>
        ) : (
          <div className="receipt-list">
            {receipts.map((doc) => (
              <ZahlungsbelegRow key={doc.id} document={doc} onUpdate={onUpdateDocument} onOpenDocument={onOpenDocument} />
            ))}
          </div>
        )}

        {receipts.length > 0 && (
          <div className="receipt-totals">
            {reimbursableTotal > 0 && (
              <span className="receipt-total-item">
                <span className="receipt-total-label">Reimbursable</span>
                <span className="receipt-total-amount">{reimbursableTotal.toFixed(2)} €</span>
              </span>
            )}
            {reportOnlyTotal > 0 && (
              <span className="receipt-total-item">
                <span className="receipt-total-label">Report only</span>
                <span className="receipt-total-amount">{reportOnlyTotal.toFixed(2)} €</span>
              </span>
            )}
            <span className="receipt-total-item receipt-grand-total">
              <span className="receipt-total-label">Trip total (daily allowances + reimbursements)</span>
              <strong className="receipt-total-amount">{grandTotal.toFixed(2)} €</strong>
            </span>
          </div>
        )}

        {/* ── Booking documents ── */}
        {documents.filter((d) => !d.isReceipt).length > 0 && (
          <>
            <h3 className="receipt-section-title" style={{ marginTop: 16 }}>Booking documents</h3>
            <div className="receipt-list">
              {documents.filter((d) => !d.isReceipt).map((doc) => (
                <BuchungsbelegRow key={doc.id} document={doc} onUpdate={onUpdateDocument} onOpenDocument={onOpenDocument} />
              ))}
            </div>
          </>
        )}

        {/* ── Upload ── */}
        <div className="receipt-upload-row">
          <input
            ref={uploadInputRef}
            type="file"
            accept=".pdf,application/pdf,image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={handleUploadFileChange}
            disabled={isUploading}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading
              ? <LoaderCircle size={14} className="button-spinner" aria-hidden="true" />
              : <FileUp size={14} />}
            {isUploading ? "Uploading…" : "Upload document"}
          </button>
          {uploadError && <span className="inline-error">{uploadError}</span>}
        </div>

      </div>
    </article>
  );
}

function documentLabel(doc: DocumentRecord): string {
  if (doc.originalFileName) return doc.originalFileName;
  if (doc.sourceType === "text_input") return "Text document";
  if (doc.sourceType === "screenshot") return "Screenshot";
  if (doc.sourceType === "email_text" || doc.sourceType === "email_attachment") return "Email document";
  return "Document";
}

/** Dokument, das als Zahlungsbeleg markiert ist — zeigt alle Felder, aufklappbar zum Bearbeiten */
function ZahlungsbelegRow({
  document,
  onUpdate,
  onOpenDocument,
}: {
  document: DocumentRecord;
  onUpdate: (docId: string, input: Partial<DocumentRecord>) => Promise<void>;
  onOpenDocument: (documentId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [draft, setDraft] = useState(() => draftFromDocument(document));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromDocument(document));
  }, [document.receiptDate, document.receiptPurpose, document.receiptAmount, document.receiptCurrency, document.receiptType]);

  async function remove() {
    setIsSaving(true);
    try {
      await onUpdate(document.id, { isReceipt: false });
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  }

  async function save() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const amount = draft.receiptAmount.trim() ? parseFloat(draft.receiptAmount) : null;
      await onUpdate(document.id, {
        receiptDate: draft.receiptDate || null,
        receiptPurpose: draft.receiptPurpose.trim() || null,
        receiptAmount: Number.isFinite(amount) ? amount : null,
        receiptCurrency: draft.receiptCurrency.trim() || null,
        receiptType: draft.receiptType,
      });
      setIsExpanded(false);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  }

  const isDirty = isDraftDirty(draft, document);

  return (
    <div className="receipt-row is-receipt">
      {/* Summary row — always visible */}
      <div className="receipt-row-header" onClick={() => setIsExpanded((e) => !e)} style={{ cursor: "pointer" }}>
        <span className="receipt-filename">{documentLabel(document)}</span>
        <span className="receipt-summary">
          {document.receiptPurpose && <span className="receipt-summary-purpose">{document.receiptPurpose}</span>}
          {document.receiptDate && <span className="receipt-summary-date">{document.receiptDate}</span>}
          {document.receiptAmount != null && (
            <span className="receipt-summary-amount">
              {document.receiptAmount.toFixed(2)} {document.receiptCurrency ?? ""}
            </span>
          )}
          {document.receiptType && (
            <span className={`receipt-type-badge ${document.receiptType}`}>
              {document.receiptType === "reimbursable" ? "Reimbursable" : "Report only"}
            </span>
          )}
        </span>
        <button
          type="button"
          className="receipt-remove-btn"
          onClick={(e) => { e.stopPropagation(); void remove(); }}
          disabled={isSaving}
          title="Demote to booking document"
        >
          <X size={14} />
        </button>
      </div>

      {/* Edit form — expanded on click */}
      {isExpanded && (
        <div className="receipt-fields">
          <label className="receipt-field">
            <span>Date</span>
            <input type="date" value={draft.receiptDate} onChange={(e) => setDraft({ ...draft, receiptDate: e.target.value })} />
          </label>
          <label className="receipt-field">
            <span>Purpose</span>
            <input type="text" placeholder="e.g. hotel booking" value={draft.receiptPurpose} onChange={(e) => setDraft({ ...draft, receiptPurpose: e.target.value })} />
          </label>
          <label className="receipt-field">
            <span>Amount</span>
            <div className="receipt-amount-row">
              <input type="number" min="0" step="0.01" placeholder="0.00" value={draft.receiptAmount} onChange={(e) => setDraft({ ...draft, receiptAmount: e.target.value })} />
              <input type="text" className="receipt-currency" maxLength={3} placeholder="EUR" value={draft.receiptCurrency} onChange={(e) => setDraft({ ...draft, receiptCurrency: e.target.value.toUpperCase() })} />
            </div>
          </label>
          <div className="receipt-field">
            <span>Type</span>
            <div className="receipt-type-toggle">
              <button type="button" className={draft.receiptType === "reimbursable" ? "active" : ""} onClick={() => setDraft({ ...draft, receiptType: "reimbursable" })}>Reimbursable</button>
              <button type="button" className={draft.receiptType === "report_only" ? "active" : ""} onClick={() => setDraft({ ...draft, receiptType: "report_only" })}>Report only</button>
            </div>
          </div>
          {saveError && <div className="inline-error">{saveError}</div>}
          <div className="receipt-save-row">
            <button type="button" className="secondary-button" onClick={() => onOpenDocument(document.id)}>
              <FileUp size={14} />
              Open
            </button>
            <button type="button" className="secondary-button" onClick={() => setIsExpanded(false)}>Cancel</button>
            <button type="button" className="primary-button" onClick={save} disabled={!isDirty || isSaving}>
              {isSaving ? <LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> : <Check size={16} />}
              {isSaving ? "Saving…" : isDirty ? "Save" : "Saved"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Buchungsbeleg — zeigt Dateiname + extrahierten Betrag; Button zum Hochstufen als Zahlungsbeleg */
function BuchungsbelegRow({
  document,
  onUpdate,
  onOpenDocument,
}: {
  document: DocumentRecord;
  onUpdate: (docId: string, input: Partial<DocumentRecord>) => Promise<void>;
  onOpenDocument: (documentId: string) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function promote() {
    setIsSaving(true);
    setSaveError(null);
    try {
      await onUpdate(document.id, { isReceipt: true });
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="receipt-row">
      <div className="receipt-row-header">
        <span className="receipt-filename">{documentLabel(document)}</span>
        {document.receiptAmount != null && (
          <span className="receipt-extracted-amount">
            {document.receiptAmount.toFixed(2)} {document.receiptCurrency ?? ""}
          </span>
        )}
        {saveError && <span className="inline-error">{saveError}</span>}
        <button
          type="button"
          className="receipt-open-btn"
          onClick={() => onOpenDocument(document.id)}
          title="Open document"
        >
          <FileUp size={13} />
        </button>
        <button
          type="button"
          className="receipt-promote-btn"
          onClick={promote}
          disabled={isSaving}
        >
          {isSaving ? <LoaderCircle size={13} className="button-spinner" /> : null}
          Mark as receipt
        </button>
      </div>
    </div>
  );
}

interface ReceiptDraft {
  receiptDate: string;
  receiptPurpose: string;
  receiptAmount: string;
  receiptCurrency: string;
  receiptType: "reimbursable" | "report_only";
}

function draftFromDocument(doc: DocumentRecord): ReceiptDraft {
  return {
    receiptDate: doc.receiptDate ?? "",
    receiptPurpose: doc.receiptPurpose ?? "",
    receiptAmount: doc.receiptAmount?.toString() ?? "",
    receiptCurrency: doc.receiptCurrency ?? "EUR",
    receiptType: doc.receiptType ?? "reimbursable",
  };
}

function isDraftDirty(draft: ReceiptDraft, doc: DocumentRecord): boolean {
  const amount = draft.receiptAmount.trim() ? parseFloat(draft.receiptAmount) : null;
  return (
    (draft.receiptDate || null) !== doc.receiptDate ||
    (draft.receiptPurpose.trim() || null) !== doc.receiptPurpose ||
    draft.receiptType !== (doc.receiptType ?? "reimbursable") ||
    draft.receiptCurrency !== (doc.receiptCurrency ?? "EUR") ||
    (Number.isFinite(amount) ? amount : null) !== doc.receiptAmount
  );
}

function iconForType(type: CalendarBooking["type"]) {
  if (type === "flight") return <Plane size={18} />;
  if (type === "lodging") return <Hotel size={18} />;
  if (type === "train") return <TrainFront size={18} />;
  return <CalendarDays size={18} />;
}

function bookingHeaderTitle(booking: CalendarBooking): string {
  if ((booking.type === "flight" || booking.type === "train") && booking.serviceIdentifier) {
    return `${booking.serviceIdentifier} · ${booking.title}`;
  }
  if (booking.type === "lodging" && booking.operator && !booking.title.includes(booking.operator)) {
    return `${booking.operator} · ${booking.title}`;
  }
  return booking.title;
}

function bookingHeaderMeta(booking: CalendarBooking): string {
  return formatBookingRange(booking);
}

function bookingRoute(booking: CalendarBooking): string | null {
  if (booking.fromText && booking.toText) return `${booking.fromText} -> ${booking.toText}`;
  if (booking.toText) return booking.toText;
  if (booking.fromText) return booking.fromText;
  return null;
}

function flightSearchUrl(booking: CalendarBooking): string | null {
  if (booking.type !== "flight" || !booking.serviceIdentifier) return null;
  const departureCode = iataCodeFromText(booking.fromText);
  if (!departureCode) return null;
  const query = `${departureCode} departure ${booking.serviceIdentifier} today`;
  return `https://www.google.com/search?q=${encodeURIComponent(query).replace(/%20/g, "+")}`;
}

function iataCodeFromText(value: string | null): string | null {
  if (!value) return null;
  const parenMatch = /\b([A-Z]{3})\b/.exec(value.toUpperCase());
  return parenMatch?.[1] ?? null;
}

function formatBookingTime(booking: CalendarBooking): string {
  const departure = timePointFor(booking, "departure") ?? booking.timePoints[0];
  if (departure) {
    return booking.toText ? `${formatTimePointLocal(departure)} · ${booking.toText}` : formatTimePointLocal(departure);
  }
  if (!booking.startAt) return "No date";
  const start = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(booking.startAt));
  return booking.toText ? `${start} · ${booking.toText}` : start;
}

function formatBookingRange(booking: CalendarBooking): string {
  const departure = timePointFor(booking, "departure") ?? timePointFor(booking, "start") ?? timePointFor(booking, "check_in") ?? null;
  const arrival = timePointFor(booking, "arrival") ?? timePointFor(booking, "end") ?? timePointFor(booking, "check_out") ?? null;
  if (departure && arrival && departure !== arrival) {
    return `${formatTimePointLocal(departure)}-${timeOnlyFromLocalDateTime(arrival.localDateTime)}`;
  }
  if (departure) {
    return formatTimePointLocal(departure);
  }
  if (arrival) {
    return formatTimePointLocal(arrival);
  }
  if (!booking.startAt) return "No date";
  const start = new Date(booking.startAt);
  if (!booking.endAt) {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(start);
  }
  const end = new Date(booking.endAt);
  const sameDate =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
  if (sameDate) {
    const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(start);
    const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
    return `${date}, ${time.format(start)}-${time.format(end)}`;
  }
  const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });
  return `${dateTime.format(start)} -> ${dateTime.format(end)}`;
}

function timePointFor(booking: CalendarBooking, label: string) {
  return booking.timePoints.find((point) => point.label === label) ?? null;
}

function timeOnlyFromLocalDateTime(value: string): string {
  const date = new Date(`${value}:00`);
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function DocumentViewer({ document, onClose }: { document: DocumentOriginalView; onClose: () => void }) {
  const source = document.base64 && document.mimeType ? `data:${document.mimeType};base64,${document.base64}` : null;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="document-viewer" aria-label="Original document">
        <header className="dialog-header">
          <div>
            <h2>{document.originalFileName ?? "Document"}</h2>
            <p>{document.mimeType ?? document.sourceType}</p>
          </div>
          <button className="icon-command" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="document-viewer-body">
          {document.mimeType === "application/pdf" && source ? (
            <iframe title={document.originalFileName ?? "PDF document"} src={source} />
          ) : document.mimeType?.startsWith("image/") && source ? (
            <img src={source} alt={document.originalFileName ?? "Document"} />
          ) : (
            <pre>{document.text ?? (source ? atob(document.base64 ?? "") : "")}</pre>
          )}
        </div>
      </section>
    </div>
  );
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
