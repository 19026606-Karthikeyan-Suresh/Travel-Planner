'use client';

import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronRight,
  Folder,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { DEFAULT_FOLDER_COLOR, FOLDER_COLORS, type Project, type TravelFolder } from '@/types/trip';
import { folderOfProject, folderTrips, isFolderExpanded, useTripStore } from '@/store/useTripStore';
import { AvatarStack, personName } from '@/components/ui/Avatar';
import { MenuDivider, MenuItem, MenuLabel, PopoverMenu } from '@/components/ui/PopoverMenu';
import { cn, formatDateRange, formatDateRangeLong, todayISO } from '@/lib/utils';

/** Search: title or destination contains the query (already lower-cased). */
export function tripMatches(project: Project, query: string): boolean {
  return !query || `${project.title} ${project.destination_name}`.toLowerCase().includes(query);
}

/* -------------------------------------------------------------------------- */
/*  PROJECTS section                                                           */
/* -------------------------------------------------------------------------- */

export function ProjectsSection({ query, onNavigate }: { query: string; onNavigate: () => void }) {
  const folders = useTripStore((s) => s.folders);
  const projects = useTripStore((s) => s.projects);
  const createFolder = useTripStore((s) => s.createFolder);
  const [creating, setCreating] = useState(false);

  const rows = folders
    .map((folder) => {
      const trips = folderTrips(folder, projects);
      const nameMatches = !query || folder.name.toLowerCase().includes(query);
      return { folder, trips: nameMatches ? trips : trips.filter((t) => tripMatches(t, query)), nameMatches };
    })
    .filter((row) => row.nameMatches || row.trips.length > 0);

  if (query && rows.length === 0) return null;

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between px-3 pb-1.5">
        <h3 className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Projects</h3>
        <button
          type="button"
          onClick={() => setCreating(true)}
          title="New project"
          aria-label="New project"
          className="-mr-1.5 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {creating && (
          <motion.div
            key="create"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden px-1 pb-1"
          >
            <FolderEditor
              placeholder="Project name, e.g. China"
              onSubmit={(name, color) => {
                setCreating(false);
                void createFolder(name, color);
              }}
              onCancel={() => setCreating(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {rows.length === 0 && !creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-lg border border-dashed border-zinc-800 px-2.5 py-2 text-left text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
        >
          <FolderPlus className="size-3.5 shrink-0" />
          Group city trips into a project, like “China”.
        </button>
      ) : (
        <ul className="space-y-0.5">
          {rows.map(({ folder, trips }) => (
            <FolderRow key={folder.id} folder={folder} trips={trips} forceExpanded={Boolean(query)} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Folder row                                                                 */
/* -------------------------------------------------------------------------- */

function FolderRow({
  folder,
  trips,
  forceExpanded,
  onNavigate,
}: {
  folder: TravelFolder;
  trips: Project[];
  forceExpanded: boolean;
  onNavigate: () => void;
}) {
  const expanded = useTripStore((s) => isFolderExpanded(s, folder)) || forceExpanded;
  const active = useTripStore((s) => s.activeFolderId === folder.id);
  const activeProjectId = useTripStore((s) => s.activeProjectId);
  const setActiveFolder = useTripStore((s) => s.setActiveFolder);
  const setActiveProject = useTripStore((s) => s.setActiveProject);
  const toggleFolder = useTripStore((s) => s.toggleFolder);
  const renameFolder = useTripStore((s) => s.renameFolder);
  const deleteFolder = useTripStore((s) => s.deleteFolder);
  const openNewTrip = useTripStore((s) => s.openNewTrip);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const FolderGlyph = expanded ? FolderOpen : Folder;

  const closeMenu = () => {
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  const addTrip = () => {
    closeMenu();
    openNewTrip(folder.id);
    onNavigate();
  };

  return (
    <li>
      {editing ? (
        <div className="px-1 py-0.5">
          <FolderEditor
            initialName={folder.name}
            initialColor={folder.color_hex}
            onSubmit={(name, color) => {
              setEditing(false);
              void renameFolder(folder.id, name, color);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div
          className={cn(
            'group relative flex items-center rounded-lg transition-colors',
            active ? 'bg-zinc-800/80 text-zinc-50' : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100',
          )}
        >
          {active && (
            <motion.span
              layoutId="active-trip-pill"
              className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <button
            type="button"
            onClick={() => toggleFolder(folder.id, !expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            className="grid h-8 w-6 shrink-0 place-items-center pl-1 text-zinc-500 hover:text-zinc-200"
          >
            <ChevronRight className={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-90')} />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveFolder(folder.id);
              onNavigate();
            }}
            aria-current={active ? 'page' : undefined}
            title={`${folder.name} · project overview`}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-9 text-left"
          >
            <FolderGlyph className="size-4 shrink-0" style={{ color: folder.color_hex }} fill={`${folder.color_hex}33`} />
            <span className="truncate text-[13.5px] font-medium">{folder.name}</span>
            <span
              className={cn(
                'ml-auto shrink-0 rounded-full px-1.5 text-[10.5px] font-medium tabular-nums',
                active ? 'bg-indigo-500/15 text-indigo-300' : 'bg-zinc-800/80 text-zinc-400',
              )}
            >
              {trips.length}
            </span>
          </button>
          <button
            ref={menuButton}
            type="button"
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            aria-label={`${folder.name} options`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(
              'absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1 text-zinc-500 transition-all hover:bg-zinc-700/60 hover:text-zinc-200 focus-visible:opacity-100',
              menuOpen ? 'bg-zinc-700/60 text-zinc-200 opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          {menuOpen && (
            <PopoverMenu anchor={menuButton.current} onClose={closeMenu} label={`${folder.name} options`} width={196}>
              <MenuItem icon={<Plus className="size-3.5" />} label="Add trip here" onSelect={addTrip} />
              <MenuItem
                icon={<Pencil className="size-3.5" />}
                label="Rename"
                onSelect={() => {
                  closeMenu();
                  setEditing(true);
                }}
              />
              <MenuDivider />
              <MenuItem
                danger
                icon={confirmDelete ? <Check className="size-3.5 text-rose-300" /> : <Trash2 className="size-3.5 text-rose-300" />}
                label={confirmDelete ? 'Click again to delete' : 'Delete project'}
                onSelect={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  closeMenu();
                  void deleteFolder(folder.id);
                }}
              />
              {confirmDelete && <p className="px-2.5 pt-0.5 pb-1.5 text-[11px] text-zinc-500">Trips inside are kept.</p>}
            </PopoverMenu>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            className="overflow-hidden"
          >
            <ul className="mt-0.5 mb-1 ml-3 space-y-0.5 border-l border-zinc-800 pl-2.5">
              {trips.map((project) => (
                <TripRow
                  key={project.id}
                  project={project}
                  active={project.id === activeProjectId}
                  folderId={folder.id}
                  nested
                  onSelect={() => {
                    setActiveProject(project.id);
                    onNavigate();
                  }}
                />
              ))}
              {trips.length === 0 && (
                <li>
                  <button
                    type="button"
                    onClick={addTrip}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300"
                  >
                    <Plus className="size-3.5" /> Add a trip
                  </button>
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline name + colour editor (create / rename)                              */
/* -------------------------------------------------------------------------- */

function FolderEditor({
  initialName = '',
  initialColor = DEFAULT_FOLDER_COLOR,
  placeholder = 'Project name',
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialColor?: string;
  placeholder?: string;
  onSubmit: (name: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const done = useRef(false);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && name.trim()) onSubmit(name.trim(), color);
    else onCancel();
  };

  return (
    <div className="rounded-lg border border-indigo-500/40 bg-zinc-900 p-2 ring-2 ring-indigo-500/10">
      <div className="flex items-center gap-2">
        <Folder className="size-4 shrink-0" style={{ color }} fill={`${color}33`} />
        <input
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(true);
            if (e.key === 'Escape') finish(false);
          }}
          // Clicking away keeps what was typed, like renaming a chat.
          onBlur={() => finish(true)}
          placeholder={placeholder}
          aria-label="Project name"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
      </div>
      <div className="mt-2 flex items-center gap-1.5 pl-6" role="radiogroup" aria-label="Project colour">
        {FOLDER_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={color === swatch}
            aria-label={`Colour ${swatch}`}
            // Keep focus in the input so blur doesn't commit mid-edit.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setColor(swatch)}
            className={cn(
              'size-4 rounded-full ring-offset-2 ring-offset-zinc-900 transition-transform hover:scale-110',
              color === swatch && 'ring-2 ring-zinc-300',
            )}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <span className="ml-auto text-[10px] text-zinc-600">Enter ↵</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Trip lists                                                                 */
/* -------------------------------------------------------------------------- */

export function TripGroup({
  label,
  projects,
  activeId,
  onSelect,
}: {
  label: string;
  projects: Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (projects.length === 0) return null;
  return (
    <section className="mb-5">
      <h3 className="px-3 pb-1.5 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{label}</h3>
      <ul className="space-y-0.5">
        {projects.map((project) => (
          <TripRow
            key={project.id}
            project={project}
            active={project.id === activeId}
            folderId={null}
            onSelect={() => onSelect(project.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function TripRow({
  project,
  active,
  folderId,
  nested = false,
  onSelect,
}: {
  project: Project;
  active: boolean;
  folderId: string | null;
  nested?: boolean;
  onSelect: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const today = todayISO();
  const ongoing = project.start_date <= today && project.end_date >= today;
  const shared = project.members.length > 1;
  const isOwner = project.currentUserRole === 'owner';
  const people = project.members.map((m) => m.profile);

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        title={`${project.destination_name} · ${formatDateRangeLong(project.start_date, project.end_date)}${
          shared ? `\nShared with ${people.map(personName).join(', ')}` : ''
        }`}
        className={cn(
          'relative flex w-full flex-col gap-1 rounded-lg py-2 pr-9 text-left transition-colors',
          nested ? 'pl-2.5' : 'pl-3',
          active ? 'bg-zinc-800/80 text-zinc-50' : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100',
        )}
      >
        {active && (
          <motion.span
            layoutId="active-trip-pill"
            className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]"
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          />
        )}
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13.5px] font-medium">{project.title}</span>
          {shared && (
            <AvatarStack
              people={people}
              max={3}
              size="xs"
              ringClassName={active ? 'ring-zinc-800' : 'ring-zinc-950'}
              className="ml-auto shrink-0"
            />
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'shrink-0 rounded-md px-1.5 py-px text-[10.5px] font-medium tabular-nums',
              active ? 'bg-indigo-500/15 text-indigo-300' : 'bg-zinc-800/80 text-zinc-400',
            )}
          >
            {formatDateRange(project.start_date, project.end_date)}
          </span>
          {ongoing && (
            <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400" /> Now
            </span>
          )}
          {shared && !isOwner && (
            <span className="shrink-0 rounded-md border border-zinc-700/70 px-1 py-px text-[10px] text-zinc-400">
              {project.currentUserRole === 'viewer' ? 'View only' : 'Shared'}
            </span>
          )}
          <span className="truncate text-[11px] text-zinc-500">{project.destination_name}</span>
        </span>
      </button>
      <button
        ref={menuButton}
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label={`${project.title} options`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={cn(
          'absolute top-2 right-1.5 rounded-md p-1 text-zinc-500 transition-all hover:bg-zinc-700/60 hover:text-zinc-200 focus-visible:opacity-100',
          menuOpen ? 'bg-zinc-700/60 text-zinc-200 opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <MoreHorizontal className="size-3.5" />
      </button>
      {menuOpen && (
        <TripMenu project={project} folderId={folderId} anchor={menuButton.current} onClose={() => setMenuOpen(false)} />
      )}
    </li>
  );
}

function TripMenu({
  project,
  folderId,
  anchor,
  onClose,
}: {
  project: Project;
  folderId: string | null;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const folders = useTripStore((s) => s.folders);
  const assignProjectToFolder = useTripStore((s) => s.assignProjectToFolder);
  const deleteProject = useTripStore((s) => s.deleteProject);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const current = folderId ?? folderOfProject(folders, project.id)?.id ?? null;
  const isOwner = project.currentUserRole === 'owner';

  const move = (target: string | null) => {
    onClose();
    void assignProjectToFolder(project.id, target);
  };

  return (
    <PopoverMenu anchor={anchor} onClose={onClose} label={`${project.title} options`}>
      <MenuLabel>Move to project</MenuLabel>
      {folders.length === 0 ? (
        <p className="px-2.5 pb-1.5 text-xs text-zinc-500">No projects yet. Create one with + next to Projects.</p>
      ) : (
        <div className="scrollbar-thin max-h-56 overflow-y-auto">
          {folders.map((folder) => (
            <MenuItem
              key={folder.id}
              icon={<FolderSwatch color={folder.color_hex} />}
              label={folder.name}
              trailing={folder.id === current ? <Check className="size-3.5 text-indigo-300" /> : undefined}
              onSelect={() => (folder.id === current ? onClose() : move(folder.id))}
            />
          ))}
        </div>
      )}
      {current && (
        <MenuItem icon={<FolderMinus className="size-3.5" />} label="Remove from project" onSelect={() => move(null)} />
      )}
      {isOwner && (
        <>
          <MenuDivider />
          <MenuItem
            danger
            icon={confirmDelete ? <Check className="size-3.5 text-rose-300" /> : <Trash2 className="size-3.5 text-rose-300" />}
            label={confirmDelete ? 'Click again to delete' : 'Delete trip'}
            onSelect={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              onClose();
              void deleteProject(project.id);
            }}
          />
        </>
      )}
    </PopoverMenu>
  );
}

function FolderSwatch({ color }: { color: string }): ReactNode {
  return <Folder className="size-3.5" style={{ color }} fill={`${color}33`} />;
}
