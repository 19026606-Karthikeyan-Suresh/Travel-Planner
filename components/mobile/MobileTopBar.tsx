'use client';

import { useState } from 'react';
import { CalendarDays, Compass, FolderOpen, Menu, UserPlus } from 'lucide-react';
import { folderTrips, selectActiveFolder, selectActiveProject, useTripStore } from '@/store/useTripStore';
import { CollaboratorsModal } from '@/components/CollaboratorsModal';
import { tripLength } from '@/lib/itinerary';
import { formatDateRange } from '@/lib/utils';

/**
 * Phones only: a floating glass header below the notch / Dynamic Island. Menu opens the
 * Trips & Projects drawer, the title re-opens the itinerary sheet, Share opens the share modal.
 * Its height (3rem) and offset are mirrored by the day strip in MapCanvas.
 */
export function MobileTopBar() {
  const mobile = useTripStore((s) => s.viewport === 'mobile');
  const project = useTripStore(selectActiveProject);
  const folder = useTripStore(selectActiveFolder);
  const folderTripCount = useTripStore((s) => {
    const active = selectActiveFolder(s);
    return active ? folderTrips(active, s.projects).length : 0;
  });
  const setPrimaryOpen = useTripStore((s) => s.setPrimaryOpen);
  const setMobilePanel = useTripStore((s) => s.setMobilePanel);
  const [shareOpen, setShareOpen] = useState(false);

  if (!mobile) return null;

  const days = project ? tripLength(project.start_date, project.end_date) : 0;

  return (
    <>
      <header className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] left-[max(0.75rem,env(safe-area-inset-left))] z-30 flex h-12 items-center gap-1 rounded-2xl border border-white/[0.08] bg-zinc-900/80 px-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl md:hidden">
        <button
          type="button"
          onClick={() => setPrimaryOpen(true)}
          aria-label="Open trips and projects"
          className="grid size-9 shrink-0 place-items-center rounded-xl text-zinc-200 transition-colors active:bg-zinc-800"
        >
          <Menu className="size-5" />
        </button>

        <button
          type="button"
          disabled={!project && !folder}
          onClick={() => setMobilePanel('workspace')}
          className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-0.5 leading-tight active:bg-zinc-800/60 disabled:active:bg-transparent"
        >
          {project ? (
            <>
              <span className="w-full truncate text-center text-sm font-semibold text-zinc-50">{project.title}</span>
              <span className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-indigo-500/15 px-1.5 py-px text-[10.5px] font-medium text-indigo-200 tabular-nums">
                <CalendarDays className="size-3 shrink-0" />
                <span className="truncate">
                  {formatDateRange(project.start_date, project.end_date)} · {days}d
                  {project.currentUserRole === 'viewer' && ' · View only'}
                </span>
              </span>
            </>
          ) : folder ? (
            <>
              <span className="flex w-full items-center justify-center gap-1.5 truncate text-sm font-semibold text-zinc-50">
                <FolderOpen className="size-4 shrink-0" style={{ color: folder.color_hex }} />
                <span className="truncate">{folder.name}</span>
              </span>
              <span className="text-[10.5px] text-zinc-400">
                Project · {folderTripCount} trip{folderTripCount === 1 ? '' : 's'}
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-50">
                <Compass className="size-4 text-indigo-400" /> Wayfarer
              </span>
              <span className="text-[10.5px] text-zinc-400">Pick a trip from the menu</span>
            </>
          )}
        </button>

        {project ? (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label={project.currentUserRole === 'owner' ? 'Share this trip' : 'See who has access'}
            className="grid size-9 shrink-0 place-items-center rounded-xl text-indigo-300 transition-colors active:bg-indigo-500/15"
          >
            <UserPlus className="size-[18px]" />
          </button>
        ) : (
          // Keeps the title centred when there's nothing to share.
          <span className="size-9 shrink-0" aria-hidden />
        )}
      </header>

      {project && <CollaboratorsModal project={project} open={shareOpen} onClose={() => setShareOpen(false)} />}
    </>
  );
}
