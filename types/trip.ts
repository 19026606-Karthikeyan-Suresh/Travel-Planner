/* -------------------------------------------------------------------------- */
/*  Lookup tables                                                              */
/* -------------------------------------------------------------------------- */

/** Mirrors `public.pin_categories.code`. */
export type PinCategory = 'sightseeing' | 'food' | 'hotel' | 'transit' | 'other';

export const PIN_CATEGORIES: readonly PinCategory[] = [
  'sightseeing',
  'food',
  'hotel',
  'transit',
  'other',
] as const;

/** Mirrors `public.collaborator_roles.code`. */
export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

/** Roles an owner can hand out; ownership is never granted through an invite. */
export type InvitableRole = Exclude<CollaboratorRole, 'owner'>;

export const COLLABORATOR_ROLES: readonly CollaboratorRole[] = ['owner', 'editor', 'viewer'] as const;
export const INVITABLE_ROLES: readonly InvitableRole[] = ['editor', 'viewer'] as const;

export const ROLE_LABELS: Record<CollaboratorRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

/** ISO calendar date, `YYYY-MM-DD` (Postgres `date`). */
export type ISODate = string;

/* -------------------------------------------------------------------------- */
/*  People                                                                     */
/* -------------------------------------------------------------------------- */

/** Row in `public.profiles` (1:1 with `auth.users`). */
export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** Row in `public.project_members`, hydrated with the member's profile. */
export interface ProjectMember {
  project_id: string;
  user_id: string;
  role_code: CollaboratorRole;
  joined_at: string | null;
  profile: UserProfile;
}

/** Row in `public.project_invitations`: an email that will join on sign-up. */
export interface ProjectInvitation {
  id: string;
  project_id: string;
  invited_email: string;
  role_code: InvitableRole;
  invited_by: string | null;
  created_at: string;
}

/** What `rpc('invite_collaborator')` reports back. */
export interface InviteResult {
  /** `added`: the email already had an account. `invited`: pending until they sign up. */
  status: 'added' | 'invited';
  email: string;
  role: InvitableRole;
}

export interface ProjectCollaborators {
  members: ProjectMember[];
  invitations: ProjectInvitation[];
}

/** Row in `public.project_share_links`: at most one per trip; `is_active = false` when disabled. */
export interface ProjectShareLink {
  id: string;
  project_id: string;
  token: string;
  role_code: InvitableRole;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

/** What `rpc('get_share_link_preview')` tells a visitor (signed in or not) about a link. */
export interface ShareLinkPreview {
  valid: boolean;
  project_id?: string;
  title?: string;
  destination_name?: string;
  start_date?: ISODate;
  end_date?: ISODate;
  role_code?: InvitableRole;
  owner_name?: string | null;
}

/** What `rpc('accept_share_link')` reports after joining. */
export interface ShareLinkAcceptResult {
  status: 'joined' | 'already_member';
  project_id: string;
  title: string;
  role_code: CollaboratorRole;
}

/* -------------------------------------------------------------------------- */
/*  Travel folders ("Projects" in the UI: a country or region of trips)        */
/* -------------------------------------------------------------------------- */

/** Row in `public.travel_folders`, plus its trips from `public.folder_projects`. */
export interface TravelFolder {
  id: string;
  owner_id: string | null;
  name: string;
  color_hex: string;
  created_at: string;
  project_ids: string[];
}

export const FOLDER_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#38bdf8'] as const;
export const DEFAULT_FOLDER_COLOR: string = FOLDER_COLORS[0];

/* -------------------------------------------------------------------------- */
/*  Projects                                                                   */
/* -------------------------------------------------------------------------- */

/** Row in `public.projects`. */
export interface ProjectRecord {
  id: string;
  created_by: string | null;
  title: string;
  destination_name: string;
  center_lat: number;
  center_lng: number;
  start_date: ISODate;
  end_date: ISODate;
  created_at: string;
}

/** A project as the UI sees it: the row plus its members and the signed-in user's role. */
export interface Project extends ProjectRecord {
  members: ProjectMember[];
  currentUserRole: CollaboratorRole;
}

export type NewProjectInput = Pick<
  ProjectRecord,
  'title' | 'destination_name' | 'center_lat' | 'center_lng' | 'start_date' | 'end_date'
>;

export type ProjectUpdate = Partial<NewProjectInput>;

/* -------------------------------------------------------------------------- */
/*  Places & pins (5NF: where a place is vs. how a trip uses it)               */
/* -------------------------------------------------------------------------- */

/** Row in `public.places`: the location itself, independent of any trip. */
export interface Place {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category_code: PinCategory;
  created_by: string | null;
  created_at: string;
}

/** Row in `public.project_pins`: a place's assignment within one trip. `day_date === null` = Saved Places. */
export interface ProjectPinRecord {
  id: string;
  project_id: string;
  place_id: string;
  added_by: string | null;
  day_date: ISODate | null;
  sort_order: number;
  notes: string | null;
  cost: number;
  created_at: string;
}

/** `project_pins` joined with its `places` row, as PostgREST returns it. */
export interface ProjectPinWithPlace extends ProjectPinRecord {
  place: Place;
}

/**
 * Flattened view model the UI renders: assignment fields from `project_pins` plus
 * the location fields from `places` (`category` ← `places.category_code`).
 */
export interface HydratedPin {
  id: string;
  project_id: string;
  place_id: string;
  added_by: string | null;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: PinCategory;
  day_date: ISODate | null;
  sort_order: number;
  notes: string | null;
  cost: number;
  created_at: string;
}

/** Alias kept so map/board/itinerary components need no churn. */
export type ProjectPin = HydratedPin;

/** Location fields: persisted on `public.places`. */
export const PLACE_FIELDS = ['name', 'address', 'lat', 'lng', 'category'] as const;
export type PlaceField = (typeof PLACE_FIELDS)[number];

/** Assignment fields: persisted on `public.project_pins`. */
export const ASSIGNMENT_FIELDS = ['day_date', 'sort_order', 'notes', 'cost'] as const;
export type AssignmentField = (typeof ASSIGNMENT_FIELDS)[number];

export type NewPinInput = Omit<HydratedPin, 'created_at' | 'id' | 'place_id' | 'added_by'>;

export type PinUpdate = Partial<Pick<HydratedPin, PlaceField | AssignmentField>>;

/** Persisted position of a pin after a drag/reorder. */
export interface PinPlacement {
  id: string;
  day_date: ISODate | null;
  sort_order: number;
}

/* -------------------------------------------------------------------------- */
/*  UI helpers                                                                 */
/* -------------------------------------------------------------------------- */

/** Bucket key used across the UI: an ISO date, or the unassigned Saved Places bucket. */
export const UNASSIGNED = 'unassigned' as const;
export type BucketKey = ISODate | typeof UNASSIGNED;

/** Map day filter: everything, one day, or the Saved Places bucket. */
export type DayFilter = 'all' | BucketKey;

export interface TripDay {
  date: ISODate;
  /** 1-based day number within the trip. */
  index: number;
  label: string;
  color: string;
}

/** Owners and editors can change the plan; viewers only look. */
export function canEditRole(role: CollaboratorRole): boolean {
  return role !== 'viewer';
}

export function canManageMembers(role: CollaboratorRole): boolean {
  return role === 'owner';
}
