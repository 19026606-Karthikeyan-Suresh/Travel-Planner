import type { PinCategory } from '@/types/trip';

/** Google's `businessStatus`; OSM results don't know, so they carry `null`. */
export type BusinessStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';

/** One place from /api/places/search or /api/places/resolve-url, whatever the provider. */
export interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category_code: PinCategory;
  business_status: BusinessStatus | null;
  /** `google`: Places API (New). `osm`: Photon / OpenStreetMap. `link`: parsed from a Maps URL alone. */
  source: 'google' | 'osm' | 'link';
  /** Short type hint for the results list, e.g. `coffee shop`. */
  kind: string;
}

export interface PlaceSearchResponse {
  results: PlaceSearchResult[];
  source: 'google' | 'osm';
}

const MAPS_SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);
const GOOGLE_HOST = /^(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;

/** Parses a pasted string as a URL, tolerating a missing `https://`. */
export function parseUrlLoose(text: string): URL | null {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

/** `maps.app.goo.gl/…`, `goo.gl/maps/…`, or `google.<tld>/maps/…` / `maps.google.<tld>/…`. */
export function isGoogleMapsUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl') return true;
  if (host === 'goo.gl') return url.pathname.startsWith('/maps');
  if (!GOOGLE_HOST.test(host)) return false;
  return host.startsWith('maps.') || url.pathname.startsWith('/maps');
}

/** Does this pasted text look like a Google Maps share link? */
export function isGoogleMapsLink(text: string): boolean {
  const url = parseUrlLoose(text);
  return url !== null && isGoogleMapsUrl(url);
}

/** Hosts a Maps link is allowed to redirect through while being expanded server-side. */
export function isAllowedMapsHop(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') return false;
  return MAPS_SHORT_HOSTS.has(host) || GOOGLE_HOST.test(host) || host === 'consent.google.com';
}
