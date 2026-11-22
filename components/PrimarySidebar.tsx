'use client';

import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { addDays } from 'date-fns';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Cloud,
  Compass,
  Folder as FolderIcon,
  HardDrive,
  LoaderCircle,
  LogOut,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import type { NewProjectInput } from '@/types/trip';
import { selectPrimaryDocked, selectPrimaryOpen, useTripStore } from '@/store/useTripStore';
import { usePlaceSearch } from '@/hooks/usePlaceSearch';
import type { PlaceResult } from '@/lib/geocode';
import { resetDemoData } from '@/lib/supabaseClient';
import { MAX_TRIP_DAYS, tripLength } from '@/lib/itinerary';
import { cn, formatDateRangeLong, parseISODate, toISODate, todayISO } from '@/lib/utils';
import { Avatar, personName } from '@/components/ui/Avatar';
import { ProjectsSection, TripGroup, tripMatches } from '@/components/sidebar/TripTree';

/* -------------------------------------------------------------------------- */
/*  Sidebar                                                                    */
/* -------------------------------------------------------------------------- */

const sidebarSpring = { type: 'spring', stiffness: 340, damping: 38, mass: 0.9 } as const;
const SIDEBAR_WIDTH = 260;

/**
 * Docked and collapsible (pushes the map) from 1024px up; below that it slides
 * over the app as a drawer and closes itself after navigation.
 */
export function PrimarySidebar() {
  const open = useTripStore(selectPrimaryOpen);
  const docked = useTripStore(selectPrimaryDocked);
  const setPrimaryOpen = useTripStore((s) => s.setPrimaryOpen);
  const newTrip = useTripStore((s) => s.newTrip);
  const openNewTrip = useTripStore((s) => s.openNewTrip);
  const closeNewTrip = useTripStore((s) => s.closeNewTrip);

  const content = (
    <SidebarContent
      onNewTrip={() => {
        openNewTrip(null);
        if (!docked) setPrimaryOpen(false);
      }}
      onNavigate={() => {
        if (!docked) setPrimaryOpen(false);
      }}
      onCollapse={() => setPrimaryOpen(false)}
    />
  );

  return (
    <>
      {/* Distinct keys: crossing the breakpoint swaps modes instead of animating one into the other. */}
      {docked ? (
        <AnimatePresence key="docked" initial={false}>
          {open && (
            <motion.aside
              key="primary-docked"
              initial={{ width: 0 }}
              animate={{ width: SIDEBAR_WIDTH }}
              exit={{ width: 0 }}
              transition={sidebarSpring}
              className="relative z-30 h-full shrink-0 overflow-hidden border-r border-zinc-800/80 bg-zinc-950 max-lg:hidden"
            >
              <div className="h-full" style={{ width: SIDEBAR_WIDTH }}>
                {content}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      ) : (
        <AnimatePresence key="overlay">
          {open && (
            <motion.div key="primary-overlay" className="fixed inset-0 z-40" initial="hidden" animate="shown" exit="hidden">
              <motion.div
                className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}
                transition={{ duration: 0.18 }}
                onClick={() => setPrimaryOpen(false)}
                aria-hidden
              />
              <motion.aside
                variants={{ hidden: { x: '-100%' }, shown: { x: 0 } }}
                transition={sidebarSpring}
                className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-zinc-800/80 bg-zinc-950 shadow-2xl shadow-black/60"
                aria-label="Trips sidebar"
              >
                {content}
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
      )}
      <NewTripModal open={newTrip.open} folderId={newTrip.folderId} onClose={closeNewTrip} />
    </>
  );
}

/** Reopens the primary sidebar; rendered wherever the collapsed sidebar used to be. */
export function SidebarToggle({ className }: { className?: string }) {
  const open = useTripStore(selectPrimaryOpen);
  const setPrimaryOpen = useTripStore((s) => s.setPrimaryOpen);
  if (open) return null;
  return (
    <button
      type="button"
      onClick={() => setPrimaryOpen(true)}
      title="Show trips"
      aria-label="Show trips"
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-xl border border-zinc-700/60 bg-zinc-900/80 text-zinc-300 backdrop-blur-md transition-colors hover:bg-zinc-800 hover:text-zinc-50',
        className,
      )}
    >
      <PanelLeftOpen className="size-4" />
    </button>
  );
}

function SidebarContent({
  onNewTrip,
  onNavigate,
  onCollapse,
}: {
  onNewTrip: () => void;
  onNavigate: () => void;
  onCollapse: () => void;
}) {
  const projects = useTripStore((s) => s.projects);
  const folders = useTripStore((s) => s.folders);
  const status = useTripStore((s) => s.projectsStatus);
  const activeProjectId = useTripStore((s) => s.activeProjectId);
  const setActiveProject = useTripStore((s) => s.setActiveProject);
  const mode = useTripStore((s) => s.mode);
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();

  // Trips filed under a Project live there; only the rest appear in Upcoming / Past.
  const { upcoming, past, matches } = useMemo(() => {
    const today = todayISO();
    const filed = new Set(folders.flatMap((f) => f.project_ids));
    const visible = projects.filter((p) => tripMatches(p, query));
    const loose = visible.filter((p) => !filed.has(p.id));
    const folderHits = folders.filter((f) => query && f.name.toLowerCase().includes(query)).length;
    return {
      upcoming: loose.filter((p) => p.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date)),
      past: loose.filter((p) => p.end_date < today).sort((a, b) => b.end_date.localeCompare(a.end_date)),
      matches: visible.length + folderHits,
    };
  }, [projects, folders, query]);

  const select = (id: string) => {
    setActiveProject(id);
    onNavigate();
  };

  return (
    <div className="flex h-full flex-col text-zinc-100">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_20px_-4px_rgba(99,102,241,0.7)]">
          <Compass className="size-[18px] text-white" strokeWidth={2.25} />
        </div>
        <div className="flex-1 leading-tight">
          <p className="text-sm font-semibold tracking-tight">Wayfarer</p>
          <p className="text-[11px] text-zinc-500">Trip planner</p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Hide trips"
          aria-label="Hide trips"
          className="-mr-1.5 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNewTrip}
          className="flex w-full items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-[0_0_24px_-6px_rgba(99,102,241,0.85)] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none active:scale-[0.98]"
        >
          <Plus className="size-4" strokeWidth={2.5} />
          New Trip
        </button>
      </div>

      <div className="px-3 pt-3">
        <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-zinc-500 focus-within:border-zinc-700 focus-within:text-zinc-300">
          <Search className="size-3.5" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search trips and projects"
            className="w-full bg-transparent text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
        </label>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pt-4 pb-3" aria-label="Trips">
        {status === 'loading' && <TripListSkeleton />}
        {status === 'ready' && <ProjectsSection query={query} onNavigate={onNavigate} />}
        {status === 'ready' && projects.length === 0 && (
          <div className="mx-2 rounded-xl border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500">
            No trips yet. Start one with <span className="text-zinc-300">New Trip</span>
            {mode === 'supabase' && ', or ask a friend to share theirs with your email'}.
          </div>
        )}
        {status === 'ready' && query && matches === 0 && (
          <p className="px-3 text-xs text-zinc-500">Nothing matches “{filter}”.</p>
        )}
        <TripGroup label="Upcoming Trips" projects={upcoming} activeId={activeProjectId} onSelect={select} />
        <TripGroup label="Past Trips" projects={past} activeId={activeProjectId} onSelect={select} />
      </nav>

      <div className="space-y-2 border-t border-zinc-800/80 p-3">
        <UserBadge />
        <SyncStatus />
      </div>
    </div>
  );
}

function TripListSkeleton() {
  return (
    <div className="space-y-2 px-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-1.5 rounded-lg px-2 py-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-zinc-900" />
        </div>
      ))}
    </div>
  );
}

function SyncStatus() {
  const mode = useTripStore((s) => s.mode);
  const pending = useTripStore((s) => s.pendingWrites);
  const saving = pending > 0;

  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-zinc-900/60 px-2.5 py-2">
      {mode === 'supabase' ? (
        <Cloud className="size-4 shrink-0 text-emerald-400" />
      ) : (
        <HardDrive className="size-4 shrink-0 text-amber-400" />
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-xs font-medium text-zinc-200">{mode === 'supabase' ? 'Supabase sync' : 'Demo mode'}</p>
        <p className="truncate text-[11px] text-zinc-500">
          {saving ? 'Saving changes…' : mode === 'supabase' ? 'All changes saved' : 'Saved in this browser'}
        </p>
      </div>
      {saving ? (
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-zinc-400" />
      ) : mode === 'demo' ? (
        <button
          type="button"
          onClick={() => {
            resetDemoData();
            window.location.reload();
          }}
          title="Reset demo data"
          aria-label="Reset demo data"
          className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <RotateCcw className="size-3.5" />
        </button>
      ) : (
        <Check className="size-3.5 shrink-0 text-emerald-400" />
      )}
    </div>
  );
}

/** Signed-in account with a quiet sign-out; absent in demo mode. */
function UserBadge() {
  const user = useTripStore((s) => s.user);
  const signOut = useTripStore((s) => s.signOut);
  const [signingOut, setSigningOut] = useState(false);
  /** Guests confirm sign-out: an anonymous session can't be signed back into. */
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  if (!user) return null;
  const name = personName(user);
  const guest = Boolean(user.is_anonymous);
  const signOutLabel = guest
    ? armed
      ? 'Click again to sign out. Guests can’t sign back in, so you’ll lose access to trips you joined.'
      : 'Sign out (guest)'
    : 'Sign out';

  return (
    <div className="group/user flex items-center gap-2.5 rounded-lg px-1.5 py-1">
      <Avatar person={user} size="md" className="ring-2 ring-zinc-800" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-xs font-medium text-zinc-200">{name}</p>
        {guest ? (
          <p className={cn('truncate text-[11px]', armed ? 'text-rose-300' : 'text-zinc-500')} title="Joined with a room code, no account">
            {armed ? 'Can’t sign back in as this guest' : 'Guest'}
          </p>
        ) : (
          <p className="truncate text-[11px] text-zinc-500" title={user.email}>
            {user.email}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={signingOut}
        onClick={async () => {
          if (guest && !armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          setSigningOut(true);
          await signOut();
          setSigningOut(false);
        }}
        title={signOutLabel}
        aria-label={signOutLabel}
        className={cn(
          'rounded-md p-1.5 transition-colors disabled:opacity-60',
          armed ? 'bg-rose-500/15 text-rose-300' : 'text-zinc-500 hover:bg-zinc-800 hover:text-rose-300',
        )}
      >
        {signingOut ? <LoaderCircle className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  New Trip modal                                                             */
/* -------------------------------------------------------------------------- */

interface Destination {
  name: string;
  lat: number;
  lng: number;
}

const PRESET_CITIES: Destination[] = [
  { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
  { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
  { name: 'New York, USA', lat: 40.7128, lng: -74.006 },
  { name: 'Lisbon, Portugal', lat: 38.7223, lng: -9.1393 },
  { name: 'Seoul, South Korea', lat: 37.5665, lng: 126.978 },
  { name: 'Barcelona, Spain', lat: 41.3874, lng: 2.1686 },
  { name: 'Mexico City, Mexico', lat: 19.4326, lng: -99.1332 },
  { name: 'Reykjavík, Iceland', lat: 64.1466, lng: -21.9426 },
  { name: 'Cape Town, South Africa', lat: -33.9249, lng: 18.4241 },
  { name: 'Bali, Indonesia', lat: -8.4095, lng: 115.1889 },
];

/** `Kyoto, Japan` from a Photon city result. */
function destinationLabel(place: PlaceResult): string {
  const country = place.address.split(', ').pop();
  return country && country !== place.name ? `${place.name}, ${country}` : place.name;
}

function defaultDates(): { start: string; end: string } {
  const start = addDays(new Date(), 14);
  return { start: toISODate(start), end: toISODate(addDays(start, 4)) };
}

function NewTripModal({ open, folderId, onClose }: { open: boolean; folderId: string | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="new-trip"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-trip-title"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            className="relative w-full max-w-[460px] rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60"
          >
            <NewTripForm initialFolderId={folderId} onClose={onClose} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NewTripForm({ initialFolderId, onClose }: { initialFolderId: string | null; onClose: () => void }) {
  const createProject = useTripStore((s) => s.createProject);
  const folders = useTripStore((s) => s.folders);
  const [folderId, setFolderId] = useState<string | null>(
    initialFolderId && folders.some((f) => f.id === initialFolderId) ? initialFolderId : null,
  );
  const folder = folders.find((f) => f.id === folderId);
  const [initialDates] = useState(defaultDates);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState<Destination | null>(null);
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);
  const [showResults, setShowResults] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const listId = useId();

  const { results, status } = usePlaceSearch(query, { citiesOnly: true, enabled: showResults && destination === null });

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const length = tripLength(startDate, endDate);
  const errors = {
    title: title.trim() ? null : 'Give your trip a name',
    destination: destination ? null : 'Pick a destination from the list',
    dates:
      !parseISODate(startDate) || !parseISODate(endDate)
        ? 'Choose both dates'
        : length < 1
          ? 'End date must be on or after the start date'
          : length > MAX_TRIP_DAYS
            ? `Trips can be up to ${MAX_TRIP_DAYS} days`
            : null,
  };
  const valid = !errors.title && !errors.destination && !errors.dates;

  const choose = (place: Destination) => {
    setDestination(place);
    setQuery(place.name);
    setShowResults(false);
    setTitle((current) => current || `Trip to ${place.name.split(',')[0]}`);
  };

  const onDestinationKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showResults || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const pick = results[highlight];
      if (pick) {
        e.preventDefault();
        choose({ name: destinationLabel(pick), lat: pick.lat, lng: pick.lng });
      }
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!valid || !destination || submitting) return;
    setSubmitting(true);
    const input: NewProjectInput = {
      title: title.trim(),
      destination_name: destination.name,
      center_lat: destination.lat,
      center_lng: destination.lng,
      start_date: startDate,
      end_date: endDate,
    };
    onClose();
    await createProject(input, folderId);
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-start justify-between border-b border-zinc-800 px-5 pt-5 pb-4">
        <div>
          <h2 id="new-trip-title" className="text-base font-semibold tracking-tight">
            Plan a new trip
          </h2>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            {folder ? (
              <>
                Adding a city to <span style={{ color: folder.color_hex }}>{folder.name}</span>. Days come from your dates.
              </>
            ) : (
              'Days are generated from your dates automatically.'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <Field label="Trip title" error={attempted ? errors.title : null}>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Autumn in Kyoto"
            maxLength={80}
            className={inputClass}
          />
        </Field>

        <Field label="Destination" error={attempted ? errors.destination : null}>
          <div className="relative">
            <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setDestination(null);
                setShowResults(true);
                setHighlight(0);
              }}
              onFocus={() => setShowResults(true)}
              onBlur={() => window.setTimeout(() => setShowResults(false), 120)}
              onKeyDown={onDestinationKey}
              placeholder="Search a city…"
              role="combobox"
              aria-expanded={showResults && results.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              className={cn(inputClass, 'pl-9', destination && 'pr-24')}
            />
            {destination && (
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                {destination.lat.toFixed(2)}, {destination.lng.toFixed(2)}
              </span>
            )}
            {status === 'loading' && !destination && (
              <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-zinc-500" />
            )}
            <AnimatePresence>
              {showResults && !destination && (results.length > 0 || status === 'error') && (
                <motion.ul
                  id={listId}
                  role="listbox"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900 p-1 shadow-2xl"
                >
                  {status === 'error' && (
                    <li className="px-3 py-2 text-xs text-zinc-500">Search is unavailable — pick a preset below.</li>
                  )}
                  {results.map((place, i) => {
                    const label = destinationLabel(place);
                    return (
                      <li key={place.id} role="option" aria-selected={i === highlight}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setHighlight(i)}
                          onClick={() => choose({ name: label, lat: place.lat, lng: place.lng })}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
                            i === highlight ? 'bg-zinc-800' : 'hover:bg-zinc-800/60',
                          )}
                        >
                          <MapPin className="size-3.5 shrink-0 text-indigo-400" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-zinc-100">{place.name}</span>
                            <span className="block truncate text-[11px] text-zinc-500">{place.address || place.kind}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
          <div className="scrollbar-none -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {PRESET_CITIES.map((city) => {
              const selected = destination?.name === city.name;
              return (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => choose(city)}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    selected
                      ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
                      : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                  )}
                >
                  {city.name.split(',')[0]}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const next = e.target.value;
                setStartDate(next);
                // Keep the range valid when the start jumps past the end.
                if (next && endDate && next > endDate) setEndDate(next);
              }}
              className={cn(inputClass, '[color-scheme:dark]')}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={cn(inputClass, '[color-scheme:dark]')}
            />
          </Field>
        </div>

        <div
          className={cn(
            'flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px]',
            errors.dates && attempted
              ? 'border-rose-500/30 bg-rose-500/5 text-rose-300'
              : 'border-zinc-800 bg-zinc-950/40 text-zinc-400',
          )}
        >
          <CalendarDays className="size-4 shrink-0" />
          {errors.dates ? (
            <span>{errors.dates}</span>
          ) : (
            <span>
              <span className="font-medium text-zinc-200">
                {length} day{length === 1 ? '' : 's'}
              </span>{' '}
              · {formatDateRangeLong(startDate, endDate)}
            </span>
          )}
        </div>

        {folders.length > 0 && (
          <Field label="Project (optional)">
            <div className="relative">
              <FolderIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                style={{ color: folder?.color_hex ?? '#71717a' }}
                fill={folder ? `${folder.color_hex}33` : 'none'}
              />
              <select
                value={folderId ?? ''}
                onChange={(e) => setFolderId(e.target.value || null)}
                className={cn(inputClass, 'appearance-none pl-9')}
              >
                <option value="">None — keep it with my other trips</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-zinc-500" />
            </div>
          </Field>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            'flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-all hover:bg-indigo-500 disabled:opacity-60',
            !valid && 'opacity-70',
          )}
        >
          {submitting && <LoaderCircle className="size-4 animate-spin" />}
          Create trip
        </button>
      </div>
    </form>
  );
}

const inputClass =
  'w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none';

function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
      {error && <p className="mt-1.5 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
