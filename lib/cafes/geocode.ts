import { searchPlaces } from '@/lib/geocode';
import { isInSingapore, type Cafe } from '@/lib/cafes/types';
import { SCRAPER_USER_AGENT, type ScrapedCafe } from '@/lib/cafes/eatbook';

/*
 * Server-side geocoding for scraped cafés. OneMap (Singapore Land Authority) resolves a
 * six-digit postal code to a building without an API key; Photon (lib/geocode) is the
 * fallback by name and address.
 */

const ONEMAP_SEARCH = 'https://www.onemap.gov.sg/api/common/elastic/search';
const SINGAPORE = { lat: 1.3521, lng: 103.8198 };

type LatLng = { lat: number; lng: number };

/** Survives refreshes: addresses rarely move, so a re-scrape only geocodes new cafés. */
const memo = new Map<string, LatLng | null>();

async function oneMap(searchVal: string): Promise<LatLng | null> {
  const url = new URL(ONEMAP_SEARCH);
  url.searchParams.set('searchVal', searchVal);
  url.searchParams.set('returnGeom', 'Y');
  url.searchParams.set('getAddrDetails', 'Y');
  url.searchParams.set('pageNum', '1');
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': SCRAPER_USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const json: unknown = await response.json();
  const results = (json as { results?: unknown }).results;
  const first: unknown = Array.isArray(results) ? results[0] : null;
  if (!first || typeof first !== 'object') return null;
  const { LATITUDE, LONGITUDE } = first as { LATITUDE?: unknown; LONGITUDE?: unknown };
  const lat = Number(LATITUDE);
  const lng = Number(LONGITUDE);
  return Number.isFinite(lat) && Number.isFinite(lng) && isInSingapore(lat, lng) ? { lat, lng } : null;
}

async function photon(query: string): Promise<LatLng | null> {
  const [hit] = await searchPlaces(query, { near: SINGAPORE, limit: 1 });
  return hit && isInSingapore(hit.lat, hit.lng) ? { lat: hit.lat, lng: hit.lng } : null;
}

async function locate(cafe: ScrapedCafe): Promise<LatLng | null> {
  const key = cafe.postalCode ?? cafe.address.toLowerCase();
  if (memo.has(key)) return memo.get(key) ?? null;

  const street = cafe.address.split(',')[0]?.trim() ?? '';
  const attempts: (() => Promise<LatLng | null>)[] = [
    ...(cafe.postalCode ? [() => oneMap(cafe.postalCode!)] : []),
    ...(street ? [() => oneMap(street)] : []),
    () => photon(`${cafe.name}, ${cafe.address}`),
  ];

  let found: LatLng | null = null;
  for (const attempt of attempts) {
    try {
      found = await attempt();
    } catch {
      found = null;
    }
    if (found) break;
  }
  memo.set(key, found);
  return found;
}

/** Geocodes with a small worker pool so the public geocoders aren't hammered. */
export async function geocodeCafes(cafes: ScrapedCafe[], concurrency = 4): Promise<Cafe[]> {
  const located: Cafe[] = new Array(cafes.length);
  let next = 0;
  const worker = async () => {
    while (next < cafes.length) {
      const index = next++;
      const cafe = cafes[index]!;
      const point = await locate(cafe);
      located[index] = { ...cafe, lat: point?.lat ?? null, lng: point?.lng ?? null };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, cafes.length) }, worker));
  return located;
}
