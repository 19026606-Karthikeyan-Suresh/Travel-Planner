import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  COLLABORATOR_ROLES,
  INVITABLE_ROLES,
  PIN_CATEGORIES,
  type CollaboratorRole,
  type InvitableRole,
  type InviteResult,
  type PinCategory,
  type PinPlacement,
  type PinUpdate,
  type Project,
  type ProjectCollaborators,
  type ProjectInvitation,
  type ProjectMember,
  type ProjectPin,
  type ProjectRecord,
  type ProjectUpdate,
  type UserProfile,
} from '@/types/trip';
import { buildSeedData, type SeedData } from '@/lib/seed';

/* -------------------------------------------------------------------------- */
/*  Database typing (5NF schema)                                               */
/* -------------------------------------------------------------------------- */

// Mapped types (rather than the interfaces themselves) satisfy supabase-js's
// `Record<string, unknown>` row constraint.
type Row<T> = { [K in keyof T]: T[K] };

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** PostgREST may serialise `numeric` / `double precision` as strings. */
type Numeric = number | string;

type ProfileRow = Row<{ id: string; email: string | null; display_name: string | null; avatar_url: string | null }>;

type ProjectRow = Row<Omit<ProjectRecord, 'center_lat' | 'center_lng'> & { center_lat: Numeric; center_lng: Numeric }>;
type ProjectInsert = Row<
  Pick<ProjectRecord, 'title' | 'destination_name' | 'center_lat' | 'center_lng' | 'start_date' | 'end_date'> & {
    id?: string;
    created_by?: string | null;
    created_at?: string;
  }
>;

type PlaceRow = Row<{
  id: string;
  name: string;
  address: string | null;
  lat: Numeric;
  lng: Numeric;
  category_code: string | null;
  created_by: string | null;
  created_at: string;
}>;
type PlaceInsert = Row<{
  id?: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  category_code?: string;
  created_by?: string | null;
  created_at?: string;
}>;

type PinRow = Row<{
  id: string;
  project_id: string;
  place_id: string;
  added_by: string | null;
  day_date: string | null;
  sort_order: number | null;
  notes: string | null;
  cost: Numeric | null;
  created_at: string;
}>;
type PinInsert = Row<{
  id?: string;
  project_id: string;
  place_id: string;
  added_by?: string | null;
  day_date?: string | null;
  sort_order?: number;
  notes?: string | null;
  cost?: number;
  created_at?: string;
}>;

type MemberRow = Row<{ project_id: string; user_id: string; role_code: string; joined_at: string | null }>;
type MemberInsert = Row<{ project_id: string; user_id: string; role_code: string; joined_at?: string }>;

type InvitationRow = Row<{
  id: string;
  project_id: string;
  invited_email: string;
  role_code: string;
  invited_by: string | null;
  created_at: string;
}>;
type InvitationInsert = Row<{
  id?: string;
  project_id: string;
  invited_email: string;
  role_code: string;
  invited_by?: string | null;
  created_at?: string;
}>;

type Table<R, I, Rel extends unknown[] = []> = { Row: R; Insert: I; Update: Row<Partial<I>>; Relationships: Rel };

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Row<Partial<ProfileRow> & { id: string }>>;
      projects: Table<
        ProjectRow,
        ProjectInsert,
        [
          {
            foreignKeyName: 'projects_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ]
      >;
      places: Table<PlaceRow, PlaceInsert>;
      project_pins: Table<
        PinRow,
        PinInsert,
        [
          {
            foreignKeyName: 'project_pins_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_pins_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
        ]
      >;
      project_members: Table<
        MemberRow,
        MemberInsert,
        [
          {
            foreignKeyName: 'project_members_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ]
      >;
      project_invitations: Table<
        InvitationRow,
        InvitationInsert,
        [
          {
            foreignKeyName: 'project_invitations_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ]
      >;
    };
    Views: Record<never, never>;
    Functions: {
      invite_collaborator: {
        Args: { p_project_id: string; p_email: string; p_role: string };
        Returns: Json;
      };
      claim_unowned_projects: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

export type TripSupabaseClient = SupabaseClient<Database>;

/* -------------------------------------------------------------------------- */
/*  Client initialisation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * supabase-js appends `/rest/v1/` itself, so a URL copied from the API settings
 * (`https://<ref>.supabase.co/rest/v1/`) would request `/rest/v1/rest/v1/…` and the
 * gateway rejects it with "Invalid path specified in request URL". Keep only the origin.
 */
function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

const SUPABASE_URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let browserClient: TripSupabaseClient | null = null;

export function getSupabaseClient(): TripSupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  browserClient ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  return browserClient;
}

/* -------------------------------------------------------------------------- */
/*  Select shapes                                                              */
/* -------------------------------------------------------------------------- */

const MEMBER_SELECT = 'project_id, user_id, role_code, joined_at, profile:profiles(id, email, display_name, avatar_url)';
const PROJECT_SELECT =
  '*, project_members(project_id, user_id, role_code, joined_at, profile:profiles(id, email, display_name, avatar_url))';
const PIN_SELECT = '*, place:places(id, name, address, lat, lng, category_code)';

/* -------------------------------------------------------------------------- */
/*  Row normalisation                                                          */
/* -------------------------------------------------------------------------- */

interface RawProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url?: string | null;
}

interface RawMember {
  project_id: string;
  user_id: string;
  role_code: string;
  joined_at: string | null;
  profile: RawProfile | null;
}

interface RawProject extends ProjectRow {
  project_members?: RawMember[] | null;
}

interface RawPlace {
  id: string;
  name: string;
  address: string | null;
  lat: Numeric;
  lng: Numeric;
  category_code: string | null;
}

interface RawPin extends PinRow {
  place: RawPlace | null;
}

/** NULL falls back to the column default; anything unexpected to `other`. */
function toCategory(value: string | null): PinCategory {
  if (value === null) return 'sightseeing';
  return PIN_CATEGORIES.find((category) => category === value) ?? 'other';
}

/** Unknown codes degrade to the least-privileged role. */
function toRole(value: string | null | undefined): CollaboratorRole {
  return COLLABORATOR_ROLES.find((role) => role === value) ?? 'viewer';
}

function toInvitableRole(value: string | null | undefined): InvitableRole {
  return INVITABLE_ROLES.find((role) => role === value) ?? 'viewer';
}

function toProfile(raw: RawProfile | null, fallbackId: string): UserProfile {
  return {
    id: raw?.id ?? fallbackId,
    email: raw?.email ?? '',
    display_name: raw?.display_name ?? null,
    avatar_url: raw?.avatar_url ?? null,
  };
}

function toMember(raw: RawMember): ProjectMember {
  return {
    project_id: raw.project_id,
    user_id: raw.user_id,
    role_code: toRole(raw.role_code),
    joined_at: raw.joined_at,
    profile: toProfile(raw.profile, raw.user_id),
  };
}

const ROLE_RANK: Record<CollaboratorRole, number> = { owner: 0, editor: 1, viewer: 2 };

function memberLabel(member: ProjectMember): string {
  return (member.profile.display_name || member.profile.email || member.user_id).toLowerCase();
}

export function sortMembers(members: ProjectMember[]): ProjectMember[] {
  return [...members].sort(
    (a, b) => ROLE_RANK[a.role_code] - ROLE_RANK[b.role_code] || memberLabel(a).localeCompare(memberLabel(b)),
  );
}

/**
 * The membership row is the RBAC source of truth; the creator is treated as owner even
 * if the owner row hasn't landed yet. No signed-in user = demo mode, where you own everything.
 */
function resolveRole(record: ProjectRecord, members: ProjectMember[], viewer: UserProfile | null): CollaboratorRole {
  if (!viewer) return 'owner';
  const own = members.find((m) => m.user_id === viewer.id);
  if (own) return own.role_code;
  if (record.created_by === viewer.id) return 'owner';
  return 'viewer';
}

/** Coerces numeric strings and attaches members + the viewer's role. */
function toProject(raw: RawProject, viewer: UserProfile | null): Project {
  const { project_members: rawMembers, ...row } = raw;
  const record: ProjectRecord = {
    ...row,
    center_lat: Number(row.center_lat),
    center_lng: Number(row.center_lng),
  };
  let members = (rawMembers ?? []).map(toMember);
  if (viewer && record.created_by === viewer.id && !members.some((m) => m.user_id === viewer.id)) {
    members = [
      ...members,
      { project_id: record.id, user_id: viewer.id, role_code: 'owner', joined_at: record.created_at, profile: viewer },
    ];
  }
  members = sortMembers(members);
  return { ...record, members, currentUserRole: resolveRole(record, members, viewer) };
}

/** Flattens `project_pins` + `places` into the UI's `HydratedPin`. */
function toPin(raw: RawPin): ProjectPin | null {
  const { place, ...row } = raw;
  if (!place) return null;
  const cost = Number(row.cost ?? 0);
  return {
    id: row.id,
    project_id: row.project_id,
    place_id: row.place_id,
    added_by: row.added_by,
    name: place.name,
    address: place.address,
    lat: Number(place.lat),
    lng: Number(place.lng),
    category: toCategory(place.category_code),
    day_date: row.day_date,
    sort_order: Number(row.sort_order ?? 0),
    notes: row.notes,
    cost: Number.isFinite(cost) ? cost : 0,
    created_at: row.created_at,
  };
}

function requirePin(raw: RawPin): ProjectPin {
  const pin = toPin(raw);
  if (!pin) throw new Error('Place details are not visible to you');
  return pin;
}

function toInvitation(row: InvitationRow): ProjectInvitation {
  return {
    id: row.id,
    project_id: row.project_id,
    invited_email: row.invited_email,
    role_code: toInvitableRole(row.role_code),
    invited_by: row.invited_by,
    created_at: row.created_at,
  };
}

/** The RPC may return a JSON object or a one-row set, depending on how it's declared. */
function toInviteResult(data: Json, email: string, role: InvitableRole): InviteResult {
  const value = Array.isArray(data) ? data[0] : data;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const status = value.status === 'added' ? 'added' : 'invited';
    return {
      status,
      email: typeof value.email === 'string' ? value.email : email,
      role: toInvitableRole(typeof value.role === 'string' ? value.role : role),
    };
  }
  return { status: 'invited', email, role };
}

function placeFields(pin: ProjectPin): PlaceInsert {
  return {
    id: pin.place_id,
    name: pin.name,
    address: pin.address,
    lat: pin.lat,
    lng: pin.lng,
    category_code: pin.category,
  };
}

function assignmentFields(pin: ProjectPin): PinInsert {
  return {
    id: pin.id,
    project_id: pin.project_id,
    place_id: pin.place_id,
    day_date: pin.day_date,
    sort_order: pin.sort_order,
    notes: pin.notes,
    cost: pin.cost,
  };
}

/** Routes each edited field to the table that owns it. */
function splitPinPatch(patch: PinUpdate): {
  place: Database['public']['Tables']['places']['Update'];
  assignment: Database['public']['Tables']['project_pins']['Update'];
} {
  const place: Database['public']['Tables']['places']['Update'] = {};
  const assignment: Database['public']['Tables']['project_pins']['Update'] = {};
  if (patch.name !== undefined) place.name = patch.name;
  if (patch.address !== undefined) place.address = patch.address;
  if (patch.lat !== undefined) place.lat = patch.lat;
  if (patch.lng !== undefined) place.lng = patch.lng;
  if (patch.category !== undefined) place.category_code = patch.category;
  if (patch.day_date !== undefined) assignment.day_date = patch.day_date;
  if (patch.sort_order !== undefined) assignment.sort_order = patch.sort_order;
  if (patch.notes !== undefined) assignment.notes = patch.notes;
  if (patch.cost !== undefined) assignment.cost = patch.cost;
  return { place, assignment };
}

const isEmpty = (value: object) => Object.keys(value).length === 0;

/* -------------------------------------------------------------------------- */
/*  Service contract                                                           */
/* -------------------------------------------------------------------------- */

export type DataMode = 'supabase' | 'demo';

/**
 * Every write accepts client-generated UUIDs (pin and place), so optimistic records
 * never need a temp-id → server-id swap.
 */
export interface TripService {
  readonly mode: DataMode;
  /** `viewer` is the signed-in user (null in demo mode); it decides `currentUserRole`. */
  listProjects(viewer: UserProfile | null): Promise<Project[]>;
  createProject(project: Project, viewer: UserProfile | null): Promise<Project>;
  updateProject(id: string, patch: ProjectUpdate): Promise<void>;
  deleteProject(id: string): Promise<void>;
  claimUnownedProjects(): Promise<void>;

  listPins(projectId: string): Promise<ProjectPin[]>;
  /** Two-step insert: `places` row first, then the `project_pins` assignment. */
  createPin(pin: ProjectPin): Promise<ProjectPin>;
  /** Undo of a delete: re-links the surviving place (recreating it only if it's gone). */
  restorePin(pin: ProjectPin): Promise<ProjectPin>;
  /** Location edits go to `places` (by `place_id`); day/order/notes/cost to `project_pins`. */
  updatePin(pin: ProjectPin, patch: PinUpdate): Promise<void>;
  deletePin(id: string): Promise<void>;
  savePlacements(placements: PinPlacement[]): Promise<void>;

  listCollaborators(projectId: string): Promise<ProjectCollaborators>;
  inviteCollaborator(projectId: string, email: string, role: InvitableRole): Promise<InviteResult>;
  updateCollaboratorRole(projectId: string, userId: string, role: InvitableRole): Promise<void>;
  removeCollaborator(projectId: string, userId: string): Promise<void>;
  revokeInvitation(invitationId: string): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*  Supabase implementation                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Runs as the signed-in user; RLS decides what each call may see or change. Ownership
 * columns (`created_by`, `added_by`) are left to their `auth.uid()` defaults.
 */
class SupabaseTripService implements TripService {
  readonly mode = 'supabase' as const;

  constructor(private readonly client: TripSupabaseClient) {}

  async listProjects(viewer: UserProfile | null): Promise<Project[]> {
    const { data, error } = await this.client
      .from('projects')
      .select(PROJECT_SELECT)
      .order('start_date', { ascending: false });
    if (error) throw error;
    return (data as RawProject[]).map((row) => toProject(row, viewer));
  }

  private async getProject(id: string, viewer: UserProfile | null): Promise<Project | null> {
    const { data, error } = await this.client.from('projects').select(PROJECT_SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toProject(data as RawProject, viewer) : null;
  }

  async createProject(project: Project, viewer: UserProfile | null): Promise<Project> {
    // No RETURNING: the SELECT policy may depend on the owner membership a trigger adds after insert.
    const { error } = await this.client.from('projects').insert({
      id: project.id,
      title: project.title,
      destination_name: project.destination_name,
      center_lat: project.center_lat,
      center_lng: project.center_lng,
      start_date: project.start_date,
      end_date: project.end_date,
    });
    if (error) throw error;
    return (await this.getProject(project.id, viewer)) ?? project;
  }

  async updateProject(id: string, patch: ProjectUpdate): Promise<void> {
    const { data, error } = await this.client.from('projects').update(patch).eq('id', id).select('id');
    if (error) throw error;
    if (data.length === 0) throw new Error("You don't have permission to edit this trip");
  }

  async deleteProject(id: string): Promise<void> {
    const { data, error } = await this.client.from('projects').delete().eq('id', id).select('id');
    if (error) throw error;
    if (data.length === 0) throw new Error('Only the trip owner can delete it');
  }

  async claimUnownedProjects(): Promise<void> {
    const { error } = await this.client.rpc('claim_unowned_projects');
    if (error) throw error;
  }

  async listPins(projectId: string): Promise<ProjectPin[]> {
    const { data, error } = await this.client
      .from('project_pins')
      .select(PIN_SELECT)
      .eq('project_id', projectId)
      .order('day_date', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data as RawPin[]).map(toPin).filter((pin): pin is ProjectPin => pin !== null);
  }

  async createPin(pin: ProjectPin): Promise<ProjectPin> {
    const { data: place, error: placeError } = await this.client.from('places').insert(placeFields(pin)).select().single();
    if (placeError) throw placeError;

    const { data, error } = await this.client
      .from('project_pins')
      .insert({ ...assignmentFields(pin), place_id: place.id })
      .select('*, place:places(*)')
      .single();
    if (error) {
      // Don't leave an orphaned place behind; best effort.
      await this.client.from('places').delete().eq('id', place.id);
      throw error;
    }
    return requirePin(data as RawPin);
  }

  async restorePin(pin: ProjectPin): Promise<ProjectPin> {
    const { data: existing, error: lookupError } = await this.client
      .from('places')
      .select('id')
      .eq('id', pin.place_id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return this.createPin(pin);

    const { data, error } = await this.client
      .from('project_pins')
      .insert(assignmentFields(pin))
      .select('*, place:places(*)')
      .single();
    if (error) throw error;
    return requirePin(data as RawPin);
  }

  async updatePin(pin: ProjectPin, patch: PinUpdate): Promise<void> {
    const { place, assignment } = splitPinPatch(patch);
    const writes: PromiseLike<{ error: unknown }>[] = [];
    if (!isEmpty(place)) writes.push(this.client.from('places').update(place).eq('id', pin.place_id));
    if (!isEmpty(assignment)) writes.push(this.client.from('project_pins').update(assignment).eq('id', pin.id));
    const results = await Promise.all(writes);
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
  }

  /** Only the trip assignment goes; the place row survives so Undo can re-link it. */
  async deletePin(id: string): Promise<void> {
    const { error } = await this.client.from('project_pins').delete().eq('id', id);
    if (error) throw error;
  }

  async savePlacements(placements: PinPlacement[]): Promise<void> {
    if (placements.length === 0) return;
    const results = await Promise.all(
      placements.map(({ id, day_date, sort_order }) =>
        this.client.from('project_pins').update({ day_date, sort_order }).eq('id', id),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
  }

  async listCollaborators(projectId: string): Promise<ProjectCollaborators> {
    const [members, invitations] = await Promise.all([
      this.client.from('project_members').select(MEMBER_SELECT).eq('project_id', projectId),
      this.client
        .from('project_invitations')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true }),
    ]);
    if (members.error) throw members.error;
    return {
      members: sortMembers((members.data as RawMember[]).map(toMember)),
      // Only owners can read invitations; everyone else just sees none.
      invitations: invitations.error ? [] : invitations.data.map(toInvitation),
    };
  }

  async inviteCollaborator(projectId: string, email: string, role: InvitableRole): Promise<InviteResult> {
    const normalized = email.trim().toLowerCase();
    const { data, error } = await this.client.rpc('invite_collaborator', {
      p_project_id: projectId,
      p_email: normalized,
      p_role: role,
    });
    if (error) throw error;
    return toInviteResult(data, normalized, role);
  }

  async updateCollaboratorRole(projectId: string, userId: string, role: InvitableRole): Promise<void> {
    const { data, error } = await this.client
      .from('project_members')
      .update({ role_code: role })
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .select('user_id');
    if (error) throw error;
    if (data.length === 0) throw new Error('Only the trip owner can change roles');
  }

  async removeCollaborator(projectId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    const { error } = await this.client.from('project_invitations').delete().eq('id', invitationId);
    if (error) throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*  Demo implementation (no env vars): seed data persisted to localStorage     */
/* -------------------------------------------------------------------------- */

const DEMO_STORAGE_KEY = 'wayfarer:demo:v2';
const DEMO_LATENCY_MS = 160;
const DEMO_SHARING_ERROR = 'Sharing needs a Supabase connection — this is demo mode.';

class LocalTripService implements TripService {
  readonly mode = 'demo' as const;
  private memory: SeedData | null = null;

  private read(): SeedData {
    if (this.memory) return this.memory;
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isSeedData(parsed)) {
          this.memory = parsed;
          return parsed;
        }
      }
    } catch {
      // Storage blocked or corrupt: fall through to fresh seed data.
    }
    this.memory = buildSeedData();
    this.write(this.memory);
    return this.memory;
  }

  private write(data: SeedData): void {
    this.memory = data;
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Private mode / quota: keep working from memory.
    }
  }

  private async tick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, DEMO_LATENCY_MS));
  }

  async listProjects(): Promise<Project[]> {
    await this.tick();
    return [...this.read().projects]
      .map((p) => ({ ...p, members: p.members ?? [], currentUserRole: 'owner' as const }))
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
  }

  async createProject(project: Project): Promise<Project> {
    await this.tick();
    const data = this.read();
    this.write({ ...data, projects: [...data.projects, project] });
    return project;
  }

  async updateProject(id: string, patch: ProjectUpdate): Promise<void> {
    await this.tick();
    const data = this.read();
    if (!data.projects.some((p) => p.id === id)) throw new Error('Trip not found');
    this.write({ ...data, projects: data.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  async deleteProject(id: string): Promise<void> {
    await this.tick();
    const data = this.read();
    this.write({
      projects: data.projects.filter((p) => p.id !== id),
      pins: data.pins.filter((pin) => pin.project_id !== id),
    });
  }

  async claimUnownedProjects(): Promise<void> {
    // Everything is already yours in demo mode.
  }

  async listPins(projectId: string): Promise<ProjectPin[]> {
    await this.tick();
    return this.read().pins.filter((pin) => pin.project_id === projectId);
  }

  async createPin(pin: ProjectPin): Promise<ProjectPin> {
    await this.tick();
    const data = this.read();
    this.write({ ...data, pins: [...data.pins, pin] });
    return pin;
  }

  restorePin(pin: ProjectPin): Promise<ProjectPin> {
    return this.createPin(pin);
  }

  async updatePin(pin: ProjectPin, patch: PinUpdate): Promise<void> {
    await this.tick();
    const data = this.read();
    if (!data.pins.some((p) => p.id === pin.id)) throw new Error('Place not found');
    this.write({ ...data, pins: data.pins.map((p) => (p.id === pin.id ? { ...p, ...patch } : p)) });
  }

  async deletePin(id: string): Promise<void> {
    await this.tick();
    const data = this.read();
    this.write({ ...data, pins: data.pins.filter((pin) => pin.id !== id) });
  }

  async savePlacements(placements: PinPlacement[]): Promise<void> {
    await this.tick();
    const byId = new Map(placements.map((p) => [p.id, p]));
    const data = this.read();
    this.write({
      ...data,
      pins: data.pins.map((pin) => {
        const placement = byId.get(pin.id);
        return placement ? { ...pin, day_date: placement.day_date, sort_order: placement.sort_order } : pin;
      }),
    });
  }

  async listCollaborators(): Promise<ProjectCollaborators> {
    await this.tick();
    return { members: [], invitations: [] };
  }

  async inviteCollaborator(): Promise<InviteResult> {
    throw new Error(DEMO_SHARING_ERROR);
  }

  async updateCollaboratorRole(): Promise<void> {
    throw new Error(DEMO_SHARING_ERROR);
  }

  async removeCollaborator(): Promise<void> {
    throw new Error(DEMO_SHARING_ERROR);
  }

  async revokeInvitation(): Promise<void> {
    throw new Error(DEMO_SHARING_ERROR);
  }
}

function isSeedData(value: unknown): value is SeedData {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { projects?: unknown }).projects) &&
    Array.isArray((value as { pins?: unknown }).pins)
  );
}

/* -------------------------------------------------------------------------- */
/*  Auth                                                                       */
/* -------------------------------------------------------------------------- */

function metadataString(user: User, key: string): string | null {
  const value: unknown = user.user_metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function profileFromAuthUser(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email ?? '',
    display_name: metadataString(user, 'display_name') ?? metadataString(user, 'full_name'),
    avatar_url: metadataString(user, 'avatar_url'),
  };
}

function requireClient(): TripSupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');
  return client;
}

/**
 * Fires once with the restored session (`INITIAL_SESSION`), then on every sign-in/out.
 * The callback is deferred a tick: supabase-js holds an auth lock while it runs, and
 * querying from inside it can deadlock.
 */
export function onAuthChange(callback: (user: UserProfile | null) => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ? profileFromAuthUser(session.user) : null;
    window.setTimeout(() => callback(user), 0);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Resolves `needsConfirmation: true` when the project requires email confirmation first. */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<{ needsConfirmation: boolean }> {
  const name = displayName?.trim();
  const { data, error } = await requireClient().auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: typeof window === 'undefined' ? undefined : window.location.origin,
      data: name ? { display_name: name, full_name: name } : undefined,
    },
  });
  if (error) throw error;
  return { needsConfirmation: data.session === null };
}

export async function signOutUser(): Promise<void> {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                         */
/* -------------------------------------------------------------------------- */

let service: TripService | null = null;

/** Supabase when env vars are present, otherwise the localStorage demo backend. */
export function getTripService(): TripService {
  if (service) return service;
  const client = getSupabaseClient();
  service = client ? new SupabaseTripService(client) : new LocalTripService();
  return service;
}

/** All trips the viewer can see, newest `start_date` first, with members and role attached. */
export function getProjects(viewer: UserProfile | null): Promise<Project[]> {
  return getTripService().listProjects(viewer);
}

/** A trip's pins ordered by `day_date` (Saved Places last), then `sort_order`. */
export function getProjectPins(projectId: string): Promise<ProjectPin[]> {
  return getTripService().listPins(projectId);
}

export function getProjectCollaborators(projectId: string): Promise<ProjectCollaborators> {
  return getTripService().listCollaborators(projectId);
}

export function inviteCollaborator(projectId: string, email: string, role: InvitableRole): Promise<InviteResult> {
  return getTripService().inviteCollaborator(projectId, email, role);
}

export function updateCollaboratorRole(projectId: string, userId: string, role: InvitableRole): Promise<void> {
  return getTripService().updateCollaboratorRole(projectId, userId, role);
}

export function removeCollaborator(projectId: string, userId: string): Promise<void> {
  return getTripService().removeCollaborator(projectId, userId);
}

export function revokeInvitation(invitationId: string): Promise<void> {
  return getTripService().revokeInvitation(invitationId);
}

export function resetDemoData(): void {
  try {
    window.localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // ignore
  }
}
