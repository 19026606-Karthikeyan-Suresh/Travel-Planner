import type { PinCategory } from '@/types/trip';
import { searchPlaces as searchPhoton } from '@/lib/geocode';
import {
  isAllowedMapsHop,
  isGoogleMapsUrl,
  type BusinessStatus,
  type PlaceSearchResult,
} from '@/lib/places/shared';

/**
 * Server-side place search. Google Places API (New) when GOOGLE_PLACES_API_KEY is set
 * (fresh POIs, closure status); Photon / OpenStreetMap otherwise, or if Google fails.
 * Keeping this on the server keeps the key out of the browser bundle.
 */

const GOOGLE_TEXT_SEARCH = 'https://places.googleapis.com/v1/places:searchText';
/** Only the fields we use, which keeps each request in the cheapest SKU that has them. */
const GOOGLE_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.primaryType,places.types';
const BIAS_RADIUS_M = 15_000;
const MAX_RESULTS = 8;
const REQUEST_TIMEOUT_MS = 8_000;

export interface LatLng {
  lat: number;
  lng: number;
}

function googleKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

/* -------------------------------------------------------------------------- */
/*  Categories                                                                 */
/* -------------------------------------------------------------------------- */

const FOOD_TYPES = new Set([
  'restaurant', 'cafe', 'coffee_shop', 'bakery', 'bar', 'pub', 'wine_bar', 'meal_takeaway', 'meal_delivery',
  'food_court', 'ice_cream_shop', 'dessert_shop', 'tea_house', 'juice_shop', 'sandwich_shop', 'confectionery',
  'candy_store', 'chocolate_shop', 'donut_shop', 'bagel_shop', 'acai_shop', 'cafeteria', 'deli', 'diner',
  'bistro', 'brewery', 'winery', 'food',
]);
const HOTEL_TYPES = new Set([
  'lodging', 'hotel', 'hostel', 'motel', 'resort_hotel', 'bed_and_breakfast', 'guest_house', 'inn', 'campground',
  'camping_cabin', 'cottage', 'farmstay', 'extended_stay_hotel', 'private_guest_room', 'budget_japanese_inn',
  'japanese_inn', 'rv_park',
]);
const TRANSIT_TYPES = new Set([
  'airport', 'international_airport', 'airstrip', 'heliport', 'train_station', 'transit_station', 'bus_station',
  'bus_stop', 'subway_station', 'light_rail_station', 'ferry_terminal', 'taxi_stand', 'car_rental',
  'park_and_ride', 'transit_depot',
]);
const SIGHT_TYPES = new Set([
  'tourist_attraction', 'museum', 'art_gallery', 'park', 'amusement_park', 'aquarium', 'zoo', 'church',
  'hindu_temple', 'mosque', 'synagogue', 'place_of_worship', 'historical_landmark', 'historical_place',
  'monument', 'beach', 'botanical_garden', 'garden', 'national_park', 'state_park', 'hiking_area',
  'observation_deck', 'plaza', 'cultural_landmark', 'cultural_center', 'landmark', 'natural_feature',
  'planetarium', 'performing_arts_theater', 'opera_house', 'concert_hall', 'wildlife_park', 'wildlife_refuge',
  'water_park', 'marina', 'castle', 'sculpture', 'visitor_center', 'amphitheatre',
]);

function categoryOfType(type: string): PinCategory | null {
  if (FOOD_TYPES.has(type) || type.endsWith('_restaurant')) return 'food';
  if (HOTEL_TYPES.has(type)) return 'hotel';
  if (TRANSIT_TYPES.has(type)) return 'transit';
  if (SIGHT_TYPES.has(type)) return 'sightseeing';
  return null;
}

/** Primary type decides when it can; otherwise the first secondary type that maps. */
export function googleCategory(primaryType: string | undefined, types: string[] = []): PinCategory {
  for (const type of [primaryType, ...types]) {
    const category = type ? categoryOfType(type) : null;
    if (category) return category;
  }
  return 'other';
}

/** For links with no Google key: a name like "Nylon Coffee Roasters" is still a good hint. */
function categoryFromName(name: string): PinCategory {
  const n = name.toLowerCase();
  if (/caf[eé]|coffee|espresso|bakery|restaurant|bistro|kitchen|eatery|ramen|sushi|pizza|bar\b|pub\b|brew|tea\b|dessert|hawker/.test(n)) return 'food';
  if (/hotel|hostel|inn\b|resort|motel|lodge|suites|b&b|guest ?house/.test(n)) return 'hotel';
  if (/airport|station|terminal|mrt|metro|subway|pier|ferry|bus interchange/.test(n)) return 'transit';
  if (/museum|gallery|park|temple|shrine|church|cathedral|palace|castle|garden|tower|beach|monument|zoo/.test(n)) return 'sightseeing';
  return 'other';
}

const humanize = (type: string | undefined) => (type ?? '').replace(/_/g, ' ');

/* -------------------------------------------------------------------------- */
/*  Google Places API (New)                                                    */
/* -------------------------------------------------------------------------- */

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
}

function toBusinessStatus(value: string | undefined): BusinessStatus | null {
  return value === 'OPERATIONAL' || value === 'CLOSED_TEMPORARILY' || value === 'CLOSED_PERMANENTLY' ? value : null;
}

function fromGoogle(place: GooglePlace): PlaceSearchResult | null {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const name = place.displayName?.text?.trim();
  if (typeof lat !== 'number' || typeof lng !== 'number' || !name) return null;
  return {
    id: `google:${place.id ?? `${lat},${lng}`}`,
    name,
    address: place.formattedAddress ?? '',
    lat,
    lng,
    category_code: googleCategory(place.primaryType, place.types),
    business_status: toBusinessStatus(place.businessStatus),
    source: 'google',
    kind: humanize(place.primaryType),
  };
}

async function googleTextSearch(
  key: string,
  textQuery: string,
  near: LatLng | null,
  options: { radius?: number; max?: number } = {},
): Promise<PlaceSearchResult[]> {
  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: options.max ?? MAX_RESULTS,
    languageCode: 'en',
  };
  if (near) {
    body.locationBias = {
      circle: { center: { latitude: near.lat, longitude: near.lng }, radius: options.radius ?? BIAS_RADIUS_M },
    };
  }
  const response = await fetch(GOOGLE_TEXT_SEARCH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': GOOGLE_FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Google Places ${response.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await response.json()) as { places?: GooglePlace[] };
  return (json.places ?? [])
    .map(fromGoogle)
    .filter((place): place is PlaceSearchResult => place !== null)
    // Gone for good: never offer them. Temporarily closed stay, flagged in the UI.
    .filter((place) => place.business_status !== 'CLOSED_PERMANENTLY');
}

/* -------------------------------------------------------------------------- */
/*  Photon / OpenStreetMap fallback                                            */
/* -------------------------------------------------------------------------- */

async function osmSearch(query: string, near: LatLng | null, limit = MAX_RESULTS): Promise<PlaceSearchResult[]> {
  const places = await searchPhoton(query, {
    near: near ?? undefined,
    limit,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return places.map((place) => ({
    id: `osm:${place.id}`,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    category_code: place.category,
    business_status: null,
    source: 'osm',
    kind: place.kind,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Public: text search                                                        */
/* -------------------------------------------------------------------------- */

export async function searchPlacesServer(
  query: string,
  near: LatLng | null,
): Promise<{ results: PlaceSearchResult[]; source: 'google' | 'osm' }> {
  const key = googleKey();
  if (key) {
    try {
      return { results: await googleTextSearch(key, query, near), source: 'google' };
    } catch (error) {
      // Bad key, quota, outage: degrade to OSM rather than an empty dropdown.
      console.warn('[places/search] Google failed, using OSM:', error instanceof Error ? error.message : error);
    }
  }
  return { results: await osmSearch(query, near), source: 'osm' };
}

/* -------------------------------------------------------------------------- */
/*  Public: Google Maps share links                                            */
/* -------------------------------------------------------------------------- */

const MAX_HOPS = 6;
const COORD = '(-?\\d{1,3}(?:\\.\\d+)?)';

/**
 * Follows a short link one redirect at a time, refusing any hop that leaves Google's
 * Maps hosts. (A blind `redirect: 'follow'` would let a crafted link make this server
 * fetch arbitrary internal URLs.)
 */
async function expandMapsUrl(start: URL): Promise<URL> {
  let current = start;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (!isAllowedMapsHop(current)) throw new Error('That link leads outside Google Maps');
    // Cookie-consent interstitials carry the real destination in `continue`.
    if (current.hostname === 'consent.google.com') {
      const target = current.searchParams.get('continue');
      if (!target) return current;
      current = new URL(target);
      continue;
    }
    // Full Maps URLs already contain everything we parse; no need to fetch them.
    if (current.hostname !== 'maps.app.goo.gl' && current.hostname !== 'goo.gl') return current;

    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WayfarerTripPlanner/1.0)', Accept: 'text/html' },
      cache: 'no-store',
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    throw new Error('That short link didn’t lead to a place');
  }
  throw new Error('Too many redirects');
}

interface ParsedMapsUrl {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

function validCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' ')).trim();
  } catch {
    return segment.replace(/\+/g, ' ').trim();
  }
}

/** "Nylon Coffee Roasters, 4 Everton Park, Singapore" → name + address. */
function splitLabel(label: string): Pick<ParsedMapsUrl, 'name' | 'address'> {
  const [name, ...rest] = label.split(',').map((part) => part.trim()).filter(Boolean);
  return { name, address: rest.join(', ') || undefined };
}

export function parseMapsUrl(url: URL): ParsedMapsUrl {
  const href = decodeSegment(url.href);
  const parsed: ParsedMapsUrl = {};

  // The pin itself (`!3d<lat>!4d<lng>`) beats the viewport centre (`@<lat>,<lng>`).
  const pin = href.match(new RegExp(`!3d${COORD}!4d${COORD}`));
  const viewport = href.match(new RegExp(`@${COORD},${COORD}`));
  const coords = pin ?? viewport;
  if (coords) {
    const lat = Number(coords[1]);
    const lng = Number(coords[2]);
    if (validCoords(lat, lng)) Object.assign(parsed, { lat, lng });
  }

  const place = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/);
  if (place?.[1]) Object.assign(parsed, splitLabel(decodeSegment(place[1])));

  for (const key of ['q', 'query', 'destination', 'll', 'center']) {
    const value = url.searchParams.get(key)?.trim();
    if (!value) continue;
    const pair = value.match(new RegExp(`^${COORD},\\s*${COORD}$`));
    if (pair) {
      const lat = Number(pair[1]);
      const lng = Number(pair[2]);
      if (parsed.lat === undefined && validCoords(lat, lng)) Object.assign(parsed, { lat, lng });
    } else if (!parsed.name && (key === 'q' || key === 'query' || key === 'destination')) {
      Object.assign(parsed, splitLabel(value));
    }
  }
  return parsed;
}

/** Expands, parses, and (with a Google key) enriches a pasted Maps link into one place. */
export async function resolveMapsLink(raw: URL): Promise<PlaceSearchResult> {
  if (!isGoogleMapsUrl(raw)) throw new Error('Paste a Google Maps link (maps.app.goo.gl or google.com/maps)');
  const finalUrl = await expandMapsUrl(raw);
  const parsed = parseMapsUrl(finalUrl);
  const at = parsed.lat !== undefined && parsed.lng !== undefined ? { lat: parsed.lat, lng: parsed.lng } : null;
  const label = [parsed.name, parsed.address].filter(Boolean).join(', ');

  const key = googleKey();
  if (key && label) {
    try {
      // Tight bias around the link's own pin, so "Starbucks" resolves to *this* Starbucks.
      const [match] = await googleTextSearch(key, label, at, { radius: at ? 300 : BIAS_RADIUS_M, max: 1 });
      if (match) return { ...match, lat: at?.lat ?? match.lat, lng: at?.lng ?? match.lng };
    } catch (error) {
      console.warn('[places/resolve-url] Google enrichment failed:', error instanceof Error ? error.message : error);
    }
  }

  if (at) {
    const name = parsed.name || 'Pinned place';
    return {
      id: `link:${at.lat.toFixed(6)},${at.lng.toFixed(6)}`,
      name,
      address: parsed.address ?? '',
      lat: at.lat,
      lng: at.lng,
      category_code: categoryFromName(name),
      business_status: null,
      source: 'link',
      kind: 'google maps link',
    };
  }

  // A name but no coordinates (e.g. `?q=Some+Cafe`): geocode it the keyless way.
  if (label) {
    const [hit] = await osmSearch(label, null, 1);
    if (hit) return { ...hit, name: parsed.name ?? hit.name };
  }
  throw new Error('Couldn’t find a location in that link');
}
