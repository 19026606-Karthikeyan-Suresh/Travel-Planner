'use client';

import { create } from 'zustand';
import {
  UNASSIGNED,
  canEditRole,
  canManageMembers,
  type BucketKey,
  type CollaboratorRole,
  type DayFilter,
  type InvitableRole,
  type InviteResult,
  type NewPinInput,
  type NewProjectInput,
  type PinPlacement,
  type PinUpdate,
  type Project,
  type ProjectInvitation,
  type ProjectMember,
  type ProjectPin,
  type ProjectUpdate,
  type UserProfile,
} from '@/types/trip';
import { getTripService, onAuthChange, signOutUser, sortMembers, type DataMode } from '@/lib/supabaseClient';
import { bucketOf, getTripDays } from '@/lib/itinerary';
import { newId } from '@/lib/utils';

export type WorkspaceTab = 'itinerary' | 'saved' | 'budget';
/** mobile < 768 ≤ tablet < 1024 ≤ desktop < 1280 ≤ wide */
export type Viewport = 'mobile' | 'tablet' | 'desktop' | 'wide';
export type MobilePanel = 'workspace' | 'map';
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
/** `disabled` = demo mode (no Supabase), where there is nobody to sign in as. */
export type AuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'disabled';

/** Imperative camera intents consumed by MapCanvas; `id` makes repeats distinct. */
export type CameraCommand =
  | { id: number; kind: 'fly'; lng: number; lat: number; zoom: number }
  | { id: number; kind: 'fit' };

export interface Notice {
  id: string;
  tone: 'error' | 'info';
  message: string;
  action?: { label: string; run: () => void };
}

/** A click on the map canvas, awaiting confirmation in the drop-pin popup. */
export interface DraftPin {
  lng: number;
  lat: number;
}

/** What the UI supplies when adding a place; the store fills project, order and defaults. */
export type NewPinDraft = Pick<NewPinInput, 'name' | 'lat' | 'lng'> &
  Partial<Pick<NewPinInput, 'address' | 'category' | 'day_date' | 'notes' | 'cost'>>;

export type InviteOutcome = { ok: true; result: InviteResult } | { ok: false; error: string };

interface TripState {
  mode: DataMode;

  user: UserProfile | null;
  authStatus: AuthStatus;

  projects: Project[];
  projectsStatus: LoadStatus;
  pinsByProject: Record<string, ProjectPin[]>;
  pinsStatus: Record<string, LoadStatus>;

  /** Keyed by project id. */
  collaborators: Record<string, ProjectMember[]>;
  invitations: Record<string, ProjectInvitation[]>;
  collaboratorsStatus: Record<string, LoadStatus>;

  activeProjectId: string | null;
  activeTab: WorkspaceTab;
  hoveredPinId: string | null;
  selectedPinId: string | null;
  dayFilter: DayFilter;
  collapsedBuckets: Record<string, boolean>;
  draftPin: DraftPin | null;
  cameraCommand: CameraCommand | null;
  /** Last settled map center; biases place search and positions custom places. */
  mapCenter: { lat: number; lng: number } | null;

  pendingWrites: number;
  notices: Notice[];

  /** `null` until the client has measured the window (the server can't know it). */
  viewport: Viewport | null;
  /** `null` = automatic: open on wide screens, closed below. */
  primaryOpen: boolean | null;
  /** Phones show the workspace and the map one at a time. */
  mobilePanel: MobilePanel;

  /** Subscribes to Supabase auth (or boots demo mode). Returns the unsubscribe. */
  startAuth: () => () => void;
  signOut: () => Promise<void>;
  loadProjects: () => Promise<void>;

  setActiveProject: (id: string | null) => void;
  createProject: (input: NewProjectInput) => Promise<Project | null>;
  updateProject: (id: string, patch: ProjectUpdate) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  leaveProject: (id: string) => Promise<boolean>;

  addPin: (draft: NewPinDraft) => Promise<ProjectPin | null>;
  updatePin: (id: string, patch: PinUpdate) => Promise<void>;
  deletePin: (id: string) => Promise<void>;
  restorePin: (pin: ProjectPin) => Promise<void>;
  movePinToBucket: (id: string, bucket: BucketKey) => Promise<void>;
  applyArrangement: (arrangement: Record<BucketKey, string[]>) => Promise<void>;

  loadCollaborators: (projectId: string) => Promise<void>;
  inviteCollaborator: (projectId: string, email: string, role: InvitableRole) => Promise<InviteOutcome>;
  updateCollaboratorRole: (projectId: string, userId: string, role: InvitableRole) => Promise<void>;
  removeCollaborator: (projectId: string, userId: string) => Promise<void>;
  revokeInvitation: (projectId: string, invitationId: string) => Promise<void>;

  setActiveTab: (tab: WorkspaceTab) => void;
  setHoveredPin: (id: string | null) => void;
  selectPin: (id: string | null, options?: { fly?: boolean; reveal?: boolean }) => void;
  setDayFilter: (filter: DayFilter) => void;
  toggleBucket: (bucket: BucketKey, collapsed?: boolean) => void;
  setDraftPin: (draft: DraftPin | null) => void;
  setMapCenter: (center: { lat: number; lng: number }) => void;
  requestFit: () => void;
  notify: (message: string, tone?: Notice['tone'], action?: Notice['action']) => void;
  dismissNotice: (id: string) => void;
  setViewport: (viewport: Viewport) => void;
  setPrimaryOpen: (open: boolean) => void;
  setMobilePanel: (panel: MobilePanel) => void;
}

export const EMPTY_PINS: ProjectPin[] = [];
export const EMPTY_MEMBERS: ProjectMember[] = [];
export const EMPTY_INVITATIONS: ProjectInvitation[] = [];
const FOCUS_ZOOM = 15;
const VIEW_ONLY_MESSAGE = 'You have view-only access to this trip.';

/* -------------------------------------------------------------------------- */
/*  Write queue: optimistic UI applies instantly, persistence runs in order    */
/* -------------------------------------------------------------------------- */

let writeChain: Promise<unknown> = Promise.resolve();
let cameraSeq = 0;
/** Users we've already tried `claim_unowned_projects` for this page session. */
const claimAttempted = new Set<string>();

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Unknown error';
}

function nextSortOrder(pins: ProjectPin[], bucket: BucketKey, projectStart: string, projectEnd: string): number {
  const days = getTripDays(projectStart, projectEnd);
  const inBucket = pins.filter((pin) => bucketOf(pin, days) === bucket);
  return inBucket.reduce((max, pin) => Math.max(max, pin.sort_order + 1), 0);
}

/** Per-account data; cleared whenever the signed-in user changes. */
const SIGNED_OUT_DATA = {
  projects: [],
  projectsStatus: 'idle',
  pinsByProject: {},
  pinsStatus: {},
  collaborators: {},
  invitations: {},
  collaboratorsStatus: {},
  activeProjectId: null,
  activeTab: 'itinerary',
  hoveredPinId: null,
  selectedPinId: null,
  dayFilter: 'all',
  collapsedBuckets: {},
  draftPin: null,
  mobilePanel: 'workspace',
} satisfies Partial<TripState>;

export const useTripStore = create<TripState>()((set, get) => {
  const service = getTripService();

  /** Runs a persisted write with a rollback on failure. */
  async function persist<T>(task: () => Promise<T>, rollback: () => void, failure: string): Promise<T | null> {
    set((s) => ({ pendingWrites: s.pendingWrites + 1 }));
    try {
      return await enqueueWrite(task);
    } catch (error) {
      rollback();
      get().notify(`${failure}: ${errorMessage(error)}`, 'error');
      return null;
    } finally {
      set((s) => ({ pendingWrites: Math.max(0, s.pendingWrites - 1) }));
    }
  }

  function camera(command: Omit<Extract<CameraCommand, { kind: 'fly' }>, 'id'> | { kind: 'fit' }): void {
    cameraSeq += 1;
    set({ cameraCommand: { ...command, id: cameraSeq } as CameraCommand });
  }

  function patchPins(projectId: string, update: (pins: ProjectPin[]) => ProjectPin[]): void {
    set((s) => ({
      pinsByProject: { ...s.pinsByProject, [projectId]: update(s.pinsByProject[projectId] ?? EMPTY_PINS) },
    }));
  }

  function findPin(id: string): ProjectPin | undefined {
    for (const pins of Object.values(get().pinsByProject)) {
      const pin = pins.find((p) => p.id === id);
      if (pin) return pin;
    }
    return undefined;
  }

  function activeProject(): Project | undefined {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  }

  function roleFor(projectId: string): CollaboratorRole {
    return get().projects.find((p) => p.id === projectId)?.currentUserRole ?? 'viewer';
  }

  /** Client-side mirror of RLS so viewers never see an optimistic change bounce back. */
  function guardEdit(projectId: string): boolean {
    if (canEditRole(roleFor(projectId))) return true;
    get().notify(VIEW_ONLY_MESSAGE, 'info');
    return false;
  }

  function guardOwner(projectId: string, message: string): boolean {
    if (canManageMembers(roleFor(projectId))) return true;
    get().notify(message, 'info');
    return false;
  }

  /** Keeps the sidebar's member dots and the viewer's role in step with the share modal. */
  function syncMembers(projectId: string, members: ProjectMember[]): void {
    const userId = get().user?.id;
    set((s) => ({
      collaborators: { ...s.collaborators, [projectId]: members },
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const own = userId ? members.find((m) => m.user_id === userId) : undefined;
        return { ...p, members, currentUserRole: own?.role_code ?? p.currentUserRole };
      }),
    }));
  }

  function dropProjectLocally(id: string): void {
    if (get().activeProjectId === id) get().setActiveProject(null);
    set((s) => {
      const { [id]: _pins, ...pinsByProject } = s.pinsByProject;
      const { [id]: _members, ...collaborators } = s.collaborators;
      const { [id]: _invites, ...invitations } = s.invitations;
      return { projects: s.projects.filter((p) => p.id !== id), pinsByProject, collaborators, invitations };
    });
  }

  async function loadPins(projectId: string): Promise<void> {
    set((s) => ({ pinsStatus: { ...s.pinsStatus, [projectId]: 'loading' } }));
    try {
      const pins = await service.listPins(projectId);
      set((s) => ({
        pinsByProject: { ...s.pinsByProject, [projectId]: pins },
        pinsStatus: { ...s.pinsStatus, [projectId]: 'ready' },
      }));
      if (get().activeProjectId === projectId) camera({ kind: 'fit' });
    } catch (error) {
      set((s) => ({ pinsStatus: { ...s.pinsStatus, [projectId]: 'error' } }));
      get().notify(`Couldn't load places: ${errorMessage(error)}`, 'error');
    }
  }

  /** Called with the restored session and on every auth transition. */
  function applyUser(user: UserProfile | null): void {
    const { user: current, authStatus } = get();
    if (!user) {
      if (authStatus !== 'signed_out') set({ ...SIGNED_OUT_DATA, user: null, authStatus: 'signed_out' });
      return;
    }
    if (current?.id === user.id && authStatus === 'signed_in') {
      // Token refresh / metadata update: same account, keep the workspace.
      set({ user });
      return;
    }
    set({ ...SIGNED_OUT_DATA, user, authStatus: 'signed_in' });
    void get().loadProjects();
  }

  return {
    mode: service.mode,

    user: null,
    authStatus: service.mode === 'demo' ? 'disabled' : 'loading',

    ...SIGNED_OUT_DATA,
    cameraCommand: null,
    mapCenter: null,

    pendingWrites: 0,
    notices: [],

    viewport: null,
    primaryOpen: null,

    startAuth: () => {
      if (service.mode === 'demo') {
        set({ authStatus: 'disabled' });
        void get().loadProjects();
        return () => undefined;
      }
      return onAuthChange(applyUser);
    },

    signOut: async () => {
      try {
        await signOutUser();
        // onAuthChange delivers SIGNED_OUT; apply it now too so the UI doesn't wait on the event.
        applyUser(null);
      } catch (error) {
        get().notify(`Couldn't sign out: ${errorMessage(error)}`, 'error');
      }
    },

    loadProjects: async () => {
      if (get().projectsStatus !== 'idle') return;
      const user = get().user;
      set({ projectsStatus: 'loading' });
      try {
        let projects = await service.listProjects(user);
        // First sign-in on a fresh schema: adopt the legacy (pre-auth) trips.
        if (projects.length === 0 && user && service.mode === 'supabase' && !claimAttempted.has(user.id)) {
          claimAttempted.add(user.id);
          try {
            await service.claimUnownedProjects();
            projects = await service.listProjects(user);
          } catch (error) {
            console.warn('[claim_unowned_projects]', errorMessage(error));
          }
        }
        // The account changed while we were loading: that load owns the state now.
        if (get().user?.id !== user?.id) return;
        set({ projects, projectsStatus: 'ready' });
        // Projects arrive newest-first; open the first so the workspace is populated on first paint.
        const first = projects[0];
        if (first && get().activeProjectId === null) get().setActiveProject(first.id);
        else camera({ kind: 'fit' });
      } catch (error) {
        if (get().user?.id !== user?.id) return;
        set({ projectsStatus: 'error' });
        get().notify(`Couldn't load trips: ${errorMessage(error)}`, 'error');
      }
    },

    setActiveProject: (id) => {
      if (id === get().activeProjectId) return;
      set({
        activeProjectId: id,
        activeTab: 'itinerary',
        hoveredPinId: null,
        selectedPinId: null,
        dayFilter: 'all',
        draftPin: null,
        mobilePanel: 'workspace',
      });
      if (id === null) {
        camera({ kind: 'fit' });
        return;
      }
      const status = get().pinsStatus[id];
      if (status === 'ready') camera({ kind: 'fit' });
      else if (status !== 'loading') void loadPins(id);
    },

    createProject: async (input) => {
      const user = get().user;
      const now = new Date().toISOString();
      const id = newId();
      const project: Project = {
        ...input,
        id,
        created_by: user?.id ?? null,
        created_at: now,
        members: user ? [{ project_id: id, user_id: user.id, role_code: 'owner', joined_at: now, profile: user }] : [],
        currentUserRole: 'owner',
      };
      set((s) => ({
        projects: [...s.projects, project],
        pinsByProject: { ...s.pinsByProject, [project.id]: [] },
        pinsStatus: { ...s.pinsStatus, [project.id]: 'ready' },
      }));
      get().setActiveProject(project.id);
      const saved = await persist(
        () => service.createProject(project, user),
        () => {
          set((s) => ({
            projects: s.projects.filter((p) => p.id !== project.id),
            activeProjectId: s.activeProjectId === project.id ? null : s.activeProjectId,
          }));
        },
        "Couldn't create trip",
      );
      if (saved) set((s) => ({ projects: s.projects.map((p) => (p.id === saved.id ? saved : p)) }));
      return saved;
    },

    updateProject: async (id, patch) => {
      const previous = get().projects.find((p) => p.id === id);
      if (!previous || !guardEdit(id)) return;
      const next: Project = { ...previous, ...patch };
      const previousPins = get().pinsByProject[id] ?? EMPTY_PINS;

      // Shrinking the date range: move pins on removed days back to Saved Places.
      const validDays = new Set(getTripDays(next.start_date, next.end_date).map((d) => d.date));
      const orphans = previousPins
        .filter((pin) => pin.day_date !== null && !validDays.has(pin.day_date))
        .sort((a, b) => (a.day_date ?? '').localeCompare(b.day_date ?? '') || a.sort_order - b.sort_order);
      let base = previousPins.filter((pin) => pin.day_date === null).reduce((m, p) => Math.max(m, p.sort_order + 1), 0);
      const placements: PinPlacement[] = orphans.map((pin) => ({ id: pin.id, day_date: null, sort_order: base++ }));

      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? next : p)) }));
      if (placements.length > 0) {
        const byId = new Map(placements.map((p) => [p.id, p]));
        patchPins(id, (pins) => pins.map((pin) => ({ ...pin, ...byId.get(pin.id) })));
        get().notify(
          `${placements.length} place${placements.length === 1 ? '' : 's'} moved to Saved Places`,
          'info',
        );
      }

      await persist(
        async () => {
          await service.updateProject(id, patch);
          await service.savePlacements(placements);
        },
        () => {
          set((s) => ({ projects: s.projects.map((p) => (p.id === id ? previous : p)) }));
          patchPins(id, () => previousPins);
        },
        "Couldn't update trip",
      );
    },

    deleteProject: async (id) => {
      const { projects, pinsByProject, activeProjectId } = get();
      const index = projects.findIndex((p) => p.id === id);
      const previous = projects[index];
      if (!previous || !guardOwner(id, 'Only the trip owner can delete it. You can leave it from Share instead.')) return;
      const previousPins = pinsByProject[id];
      if (activeProjectId === id) get().setActiveProject(null);
      set((s) => {
        const { [id]: _removed, ...rest } = s.pinsByProject;
        return { projects: s.projects.filter((p) => p.id !== id), pinsByProject: rest };
      });
      await persist(
        () => service.deleteProject(id),
        () => {
          set((s) => {
            const restored = [...s.projects];
            restored.splice(index, 0, previous);
            return {
              projects: restored,
              pinsByProject: previousPins ? { ...s.pinsByProject, [id]: previousPins } : s.pinsByProject,
            };
          });
        },
        "Couldn't delete trip",
      );
    },

    leaveProject: async (id) => {
      const user = get().user;
      const project = get().projects.find((p) => p.id === id);
      if (!user || !project) return false;
      if (project.currentUserRole === 'owner') {
        get().notify('Owners can’t leave their own trip.', 'info');
        return false;
      }
      const left = await persist(
        async () => {
          await service.removeCollaborator(id, user.id);
          return true;
        },
        () => undefined,
        "Couldn't leave trip",
      );
      if (!left) return false;
      dropProjectLocally(id);
      get().notify(`You left “${project.title}”`, 'info');
      return true;
    },

    addPin: async (draft) => {
      const project = activeProject();
      if (!project || !guardEdit(project.id)) return null;
      const pins = get().pinsByProject[project.id] ?? EMPTY_PINS;
      const dayDate = draft.day_date ?? null;
      const pin: ProjectPin = {
        id: newId(),
        project_id: project.id,
        place_id: newId(),
        added_by: get().user?.id ?? null,
        name: draft.name.trim() || 'Untitled place',
        address: draft.address ?? null,
        lat: draft.lat,
        lng: draft.lng,
        category: draft.category ?? 'sightseeing',
        day_date: dayDate,
        sort_order: nextSortOrder(pins, dayDate ?? UNASSIGNED, project.start_date, project.end_date),
        notes: draft.notes ?? null,
        cost: draft.cost ?? 0,
        created_at: new Date().toISOString(),
      };
      patchPins(project.id, (list) => [...list, pin]);
      set((s) => ({
        selectedPinId: pin.id,
        collapsedBuckets: { ...s.collapsedBuckets, [dayDate ?? UNASSIGNED]: false },
      }));
      const { dayFilter } = get();
      if (dayFilter !== 'all' && dayFilter !== (dayDate ?? UNASSIGNED)) set({ dayFilter: 'all' });
      camera({ kind: 'fly', lng: pin.lng, lat: pin.lat, zoom: FOCUS_ZOOM });

      const saved = await persist(
        () => service.createPin(pin),
        () => patchPins(project.id, (list) => list.filter((p) => p.id !== pin.id)),
        "Couldn't add place",
      );
      if (saved) patchPins(project.id, (list) => list.map((p) => (p.id === saved.id ? saved : p)));
      return saved;
    },

    updatePin: async (id, patch) => {
      const previous = findPin(id);
      if (!previous || !guardEdit(previous.project_id)) return;
      patchPins(previous.project_id, (list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      await persist(
        () => service.updatePin(previous, patch),
        () => patchPins(previous.project_id, (list) => list.map((p) => (p.id === id ? previous : p))),
        "Couldn't save place",
      );
    },

    deletePin: async (id) => {
      const previous = findPin(id);
      if (!previous || !guardEdit(previous.project_id)) return;
      patchPins(previous.project_id, (list) => list.filter((p) => p.id !== id));
      set((s) => ({
        selectedPinId: s.selectedPinId === id ? null : s.selectedPinId,
        hoveredPinId: s.hoveredPinId === id ? null : s.hoveredPinId,
      }));
      const removed = await persist(
        async () => {
          await service.deletePin(id);
          return true;
        },
        () => patchPins(previous.project_id, (list) => [...list, previous]),
        "Couldn't delete place",
      );
      if (removed) get().notify(`Removed “${previous.name}”`, 'info', { label: 'Undo', run: () => void get().restorePin(previous) });
    },

    restorePin: async (pin) => {
      if (findPin(pin.id) || !guardEdit(pin.project_id)) return;
      patchPins(pin.project_id, (list) => [...list, pin]);
      await persist(
        () => service.restorePin(pin),
        () => patchPins(pin.project_id, (list) => list.filter((p) => p.id !== pin.id)),
        "Couldn't restore place",
      );
    },

    movePinToBucket: async (id, bucket) => {
      const pin = findPin(id);
      const project = get().projects.find((p) => p.id === pin?.project_id);
      if (!pin || !project) return;
      const pins = get().pinsByProject[project.id] ?? EMPTY_PINS;
      const days = getTripDays(project.start_date, project.end_date);
      if (bucketOf(pin, days) === bucket) return;
      const sortOrder = nextSortOrder(pins, bucket, project.start_date, project.end_date);
      set((s) => ({ collapsedBuckets: { ...s.collapsedBuckets, [bucket]: false } }));
      await get().updatePin(id, { day_date: bucket === UNASSIGNED ? null : bucket, sort_order: sortOrder });
    },

    applyArrangement: async (arrangement) => {
      const projectId = get().activeProjectId;
      if (!projectId || !guardEdit(projectId)) return;
      const previousPins = get().pinsByProject[projectId] ?? EMPTY_PINS;
      const byId = new Map(previousPins.map((pin) => [pin.id, pin]));

      const placements: PinPlacement[] = [];
      for (const [bucket, ids] of Object.entries(arrangement)) {
        const dayDate = bucket === UNASSIGNED ? null : bucket;
        ids.forEach((id, index) => {
          const pin = byId.get(id);
          if (pin && (pin.day_date !== dayDate || pin.sort_order !== index)) {
            placements.push({ id, day_date: dayDate, sort_order: index });
          }
        });
      }
      if (placements.length === 0) return;

      const changes = new Map(placements.map((p) => [p.id, p]));
      patchPins(projectId, (list) => list.map((pin) => ({ ...pin, ...changes.get(pin.id) })));
      await persist(
        () => service.savePlacements(placements),
        () => patchPins(projectId, () => previousPins),
        "Couldn't save new order",
      );
    },

    /* --------------------------------------------------------- sharing --- */

    loadCollaborators: async (projectId) => {
      set((s) => ({ collaboratorsStatus: { ...s.collaboratorsStatus, [projectId]: 'loading' } }));
      try {
        const { members, invitations } = await service.listCollaborators(projectId);
        set((s) => ({
          invitations: { ...s.invitations, [projectId]: invitations },
          collaboratorsStatus: { ...s.collaboratorsStatus, [projectId]: 'ready' },
        }));
        // Demo mode has no membership table; keep whatever the project already carries.
        if (members.length > 0) syncMembers(projectId, members);
        else
          set((s) => ({
            collaborators: {
              ...s.collaborators,
              [projectId]: s.projects.find((p) => p.id === projectId)?.members ?? EMPTY_MEMBERS,
            },
          }));
      } catch (error) {
        set((s) => ({ collaboratorsStatus: { ...s.collaboratorsStatus, [projectId]: 'error' } }));
        get().notify(`Couldn't load collaborators: ${errorMessage(error)}`, 'error');
      }
    },

    inviteCollaborator: async (projectId, email, role) => {
      if (!canManageMembers(roleFor(projectId))) return { ok: false, error: 'Only the trip owner can invite people.' };
      set((s) => ({ pendingWrites: s.pendingWrites + 1 }));
      try {
        const result = await enqueueWrite(() => service.inviteCollaborator(projectId, email, role));
        await get().loadCollaborators(projectId);
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      } finally {
        set((s) => ({ pendingWrites: Math.max(0, s.pendingWrites - 1) }));
      }
    },

    updateCollaboratorRole: async (projectId, userId, role) => {
      if (!guardOwner(projectId, 'Only the trip owner can change roles.')) return;
      const previous = get().collaborators[projectId] ?? EMPTY_MEMBERS;
      const target = previous.find((m) => m.user_id === userId);
      if (!target || target.role_code === 'owner' || target.role_code === role) return;
      syncMembers(projectId, sortMembers(previous.map((m) => (m.user_id === userId ? { ...m, role_code: role } : m))));
      await persist(
        () => service.updateCollaboratorRole(projectId, userId, role),
        () => syncMembers(projectId, previous),
        "Couldn't change role",
      );
    },

    removeCollaborator: async (projectId, userId) => {
      if (!guardOwner(projectId, 'Only the trip owner can remove people.')) return;
      const previous = get().collaborators[projectId] ?? EMPTY_MEMBERS;
      const target = previous.find((m) => m.user_id === userId);
      if (!target || target.role_code === 'owner') return;
      syncMembers(projectId, previous.filter((m) => m.user_id !== userId));
      await persist(
        () => service.removeCollaborator(projectId, userId),
        () => syncMembers(projectId, previous),
        "Couldn't remove collaborator",
      );
    },

    revokeInvitation: async (projectId, invitationId) => {
      if (!guardOwner(projectId, 'Only the trip owner can revoke invitations.')) return;
      const previous = get().invitations[projectId] ?? EMPTY_INVITATIONS;
      set((s) => ({ invitations: { ...s.invitations, [projectId]: previous.filter((i) => i.id !== invitationId) } }));
      await persist(
        () => service.revokeInvitation(invitationId),
        () => set((s) => ({ invitations: { ...s.invitations, [projectId]: previous } })),
        "Couldn't revoke invitation",
      );
    },

    /* -------------------------------------------------------------- UI --- */

    setActiveTab: (tab) => set({ activeTab: tab }),

    setHoveredPin: (id) => {
      if (get().hoveredPinId !== id) set({ hoveredPinId: id });
    },

    selectPin: (id, options = {}) => {
      if (id === null) {
        set({ selectedPinId: null });
        return;
      }
      const pin = findPin(id);
      const project = get().projects.find((p) => p.id === pin?.project_id);
      if (!pin || !project) return;
      const bucket = bucketOf(pin, getTripDays(project.start_date, project.end_date));
      const { dayFilter } = get();
      set((s) => ({
        selectedPinId: id,
        // Never fly to a marker the day filter is hiding.
        dayFilter: dayFilter === 'all' || dayFilter === bucket ? dayFilter : 'all',
        ...(options.reveal
          ? {
              activeTab: bucket === UNASSIGNED ? 'saved' : 'itinerary',
              collapsedBuckets: { ...s.collapsedBuckets, [bucket]: false },
            }
          : {}),
      }));
      if (options.fly) {
        camera({ kind: 'fly', lng: pin.lng, lat: pin.lat, zoom: FOCUS_ZOOM });
        // On phones the sheet covers the map; reveal it so the fly-to is visible.
        if (get().viewport === 'mobile') set({ mobilePanel: 'map' });
      }
    },

    setDayFilter: (filter) => {
      set({ dayFilter: filter });
      camera({ kind: 'fit' });
    },

    toggleBucket: (bucket, collapsed) =>
      set((s) => ({
        collapsedBuckets: { ...s.collapsedBuckets, [bucket]: collapsed ?? !s.collapsedBuckets[bucket] },
      })),

    setDraftPin: (draft) => {
      if (draft) {
        const id = get().activeProjectId;
        if (!id || !canEditRole(roleFor(id))) return;
      }
      set({ draftPin: draft });
    },

    setMapCenter: (center) => set({ mapCenter: center }),

    requestFit: () => camera({ kind: 'fit' }),

    notify: (message, tone = 'info', action) => {
      const notice: Notice = { id: newId(), tone, message, action };
      set((s) => ({ notices: [...s.notices.slice(-3), notice] }));
      setTimeout(() => get().dismissNotice(notice.id), tone === 'error' ? 6000 : 3500);
    },

    dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),

    setViewport: (viewport) => {
      // Crossing a breakpoint returns the sidebar to its automatic state for that size.
      if (viewport !== get().viewport) set({ viewport, primaryOpen: null });
    },

    setPrimaryOpen: (open) => set({ primaryOpen: open }),

    setMobilePanel: (panel) => set({ mobilePanel: panel }),
  };
});

/* -------------------------------------------------------------------------- */
/*  Selectors (return stable references to avoid render loops)                 */
/* -------------------------------------------------------------------------- */

export const selectActiveProject = (s: TripState): Project | undefined =>
  s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId) : undefined;

export const selectActivePins = (s: TripState): ProjectPin[] =>
  (s.activeProjectId ? s.pinsByProject[s.activeProjectId] : undefined) ?? EMPTY_PINS;

/** The signed-in user's role on the open trip (`owner` in demo mode). */
export const selectCurrentUserRole = (s: TripState): CollaboratorRole =>
  selectActiveProject(s)?.currentUserRole ?? 'viewer';

/** Owners and editors may change the open trip; viewers get the read-only UI. */
export const selectCanEdit = (s: TripState): boolean => canEditRole(selectCurrentUserRole(s));

export const selectCanManageMembers = (s: TripState): boolean => canManageMembers(selectCurrentUserRole(s));

export const selectPrimaryOpen = (s: TripState): boolean => s.primaryOpen ?? s.viewport === 'wide';

/** Docked sidebars push the map; otherwise the primary sidebar overlays it. */
export const selectPrimaryDocked = (s: TripState): boolean => s.viewport === 'desktop' || s.viewport === 'wide';

export const selectActivePinsStatus = (s: TripState): LoadStatus =>
  (s.activeProjectId ? s.pinsStatus[s.activeProjectId] : undefined) ?? 'idle';
