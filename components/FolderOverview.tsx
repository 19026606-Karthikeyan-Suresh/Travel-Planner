'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, ChevronRight, FolderOpen, MapPin, Plus, Route, Wallet, X } from 'lucide-react';
import type { Project, ProjectPin } from '@/types/trip';
import { folderTrips, useTripStore } from '@/store/useTripStore';
import { sumCost, tripColorMap, tripLength } from '@/lib/itinerary';
import { SidebarToggle } from '@/components/PrimarySidebar';
import { AvatarStack } from '@/components/ui/Avatar';
import { cn, formatCurrency, formatDateRange, formatDateRangeLong } from '@/lib/utils';

/**
 * Project Overview: every city trip in a folder at a glance. The map shows all of
 * their pins at once, coloured to match the dots here.
 */
export function FolderOverview({ folderId, width }: { folderId: string; width: number | '100%' }) {
  const folder = useTripStore((s) => s.folders.find((f) => f.id === folderId));
  const projects = useTripStore((s) => s.projects);
  const folderPins = useTripStore((s) => s.folderPins);
  const status = useTripStore((s) => s.folderPinsStatus);
  const setActiveFolder = useTripStore((s) => s.setActiveFolder);
  const setActiveProject = useTripStore((s) => s.setActiveProject);
  const openNewTrip = useTripStore((s) => s.openNewTrip);

  const trips = useMemo(() => (folder ? folderTrips(folder, projects) : []), [folder, projects]);
  const colors = useMemo(() => tripColorMap(trips.map((t) => t.id)), [trips]);
  const pinsByTrip = useMemo(() => {
    const map = new Map<string, ProjectPin[]>();
    for (const pin of folderPins) {
      const list = map.get(pin.project_id) ?? [];
      list.push(pin);
      map.set(pin.project_id, list);
    }
    return map;
  }, [folderPins]);

  if (!folder) return null;

  const loadingPins = status === 'loading' || status === 'idle';
  const first = trips[0];
  const span = first
    ? {
        start: first.start_date,
        end: trips.reduce((max, t) => (t.end_date > max ? t.end_date : max), first.end_date),
      }
    : null;

  return (
    <div className="flex h-full flex-col" style={{ width }}>
      <header className="relative z-10 shrink-0 border-b border-zinc-800 bg-zinc-900/95 px-4 pt-4 pb-4 backdrop-blur-md sm:px-5">
        <div className="flex items-start gap-3">
          <SidebarToggle className="mt-0.5" />
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: `${folder.color_hex}1f`, color: folder.color_hex, boxShadow: `inset 0 0 0 1px ${folder.color_hex}40` }}
          >
            <FolderOpen className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-500">Project overview</p>
            <h2 className="truncate text-lg font-semibold tracking-tight text-zinc-50">{folder.name}</h2>
          </div>
          <button
            type="button"
            onClick={() => setActiveFolder(null)}
            className="-mr-1.5 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Close project"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill icon={<Route className="size-3.5 text-indigo-400" />}>
            {trips.length} {trips.length === 1 ? 'trip' : 'trips'}
          </Pill>
          {span && (
            <Pill icon={<CalendarDays className="size-3.5 text-indigo-400" />} title={formatDateRangeLong(span.start, span.end)}>
              {formatDateRange(span.start, span.end)}
              <span className="text-zinc-500">· {tripLength(span.start, span.end)}d</span>
            </Pill>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 tabular-nums">
            <Wallet className="size-3.5" />
            {loadingPins && folderPins.length === 0 ? '—' : formatCurrency(sumCost(folderPins))}
          </span>
          <Pill icon={<MapPin className="size-3.5" />}>
            {loadingPins && folderPins.length === 0 ? '…' : folderPins.length} place{folderPins.length === 1 ? '' : 's'}
          </Pill>
        </div>

        <button
          type="button"
          onClick={() => openNewTrip(folder.id)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-200 transition-all hover:border-indigo-400/50 hover:bg-indigo-500/20 hover:shadow-[0_0_20px_-6px_rgba(99,102,241,0.8)]"
        >
          <Plus className="size-4" /> Add Trip to {folder.name}
        </button>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pt-4 pb-28">
        {trips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-8 text-center">
            <p className="text-sm font-medium text-zinc-300">No trips in {folder.name} yet</p>
            <p className="mt-1 text-xs text-zinc-500">
              Add a city plan above, or use a trip’s ••• menu in the sidebar to move it here.
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {trips.map((trip, i) => (
              <motion.li
                key={trip.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.18 }}
                className="relative"
              >
                {i < trips.length - 1 && (
                  <span className="absolute top-9 -bottom-2 left-[20px] w-px bg-zinc-800" aria-hidden />
                )}
                <TripCard
                  trip={trip}
                  color={colors.get(trip.id) ?? folder.color_hex}
                  pins={pinsByTrip.get(trip.id)}
                  loading={loadingPins}
                  onOpen={() => setActiveProject(trip.id)}
                />
              </motion.li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Pill({ icon, title, children }: { icon: React.ReactNode; title?: string; children: React.ReactNode }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/60 px-2.5 py-1 text-xs font-medium text-zinc-200 tabular-nums"
    >
      {icon}
      {children}
    </span>
  );
}

function TripCard({
  trip,
  color,
  pins,
  loading,
  onOpen,
}: {
  trip: Project;
  color: string;
  pins: ProjectPin[] | undefined;
  loading: boolean;
  onOpen: () => void;
}) {
  const stops = pins?.length ?? 0;
  const cost = pins ? sumCost(pins) : 0;
  const days = tripLength(trip.start_date, trip.end_date);
  const people = trip.members.map((m) => m.profile);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full items-start gap-3 rounded-xl border border-zinc-700/50 bg-zinc-800/60 p-3.5 text-left transition-all hover:border-zinc-600 hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:outline-none"
    >
      <span
        className="mt-1 grid size-3 shrink-0 place-items-center rounded-full ring-4 ring-zinc-900"
        style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium text-zinc-100">{trip.title}</p>
          {cost > 0 && (
            <span className="shrink-0 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300 tabular-nums">
              {formatCurrency(cost)}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-zinc-500">{trip.destination_name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400 tabular-nums">
          <span className="rounded-md bg-zinc-900/70 px-1.5 py-px font-medium text-zinc-300">
            {formatDateRange(trip.start_date, trip.end_date)}
          </span>
          <span>
            {days} day{days === 1 ? '' : 's'}
          </span>
          <span className="text-zinc-600">·</span>
          <span className={cn(loading && !pins && 'animate-pulse')}>
            {loading && !pins ? 'Loading…' : `${stops} stop${stops === 1 ? '' : 's'}`}
          </span>
          {people.length > 1 && (
            <AvatarStack people={people} max={3} size="xs" ringClassName="ring-zinc-800" className="ml-auto" />
          )}
        </div>
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-300" />
    </button>
  );
}
