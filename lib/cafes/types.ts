/** What the Cafés panel shows: facts scraped from Singapore food guides, never their prose. */

export type CafeType = 'specialty-coffee' | 'brunch' | 'bakery' | 'dessert' | 'work-friendly' | 'cafe';

export const CAFE_TYPES: readonly CafeType[] = [
  'specialty-coffee',
  'brunch',
  'bakery',
  'dessert',
  'work-friendly',
  'cafe',
] as const;

export const CAFE_TYPE_LABELS: Record<CafeType, string> = {
  'specialty-coffee': 'Specialty coffee',
  brunch: 'Brunch',
  bakery: 'Bakery',
  dessert: 'Dessert',
  'work-friendly': 'Work-friendly',
  cafe: 'Café',
};

/** From the typical dish price: `$` ≤ S$10, `$$` ≤ S$25, `$$$` above. */
export type PriceTier = '$' | '$$' | '$$$';
export const PRICE_TIERS: readonly PriceTier[] = ['$', '$$', '$$$'] as const;

export type HalalStatus = 'certified' | 'no-pork-lard' | 'not-certified';

export interface Cafe {
  /** Slug of the name; stable across scrapes. */
  id: string;
  name: string;
  /** Neighbourhood from the guide's section heading, else from the postal district. */
  area: string | null;
  address: string;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  /** Compact opening hours, e.g. "Tue–Sun 8am–7pm". */
  hours: string | null;
  /** Cheapest and dearest dish prices the guide quotes (S$). */
  priceMin: number | null;
  priceMax: number | null;
  priceTier: PriceTier | null;
  types: CafeType[];
  /** Charging ports / power sockets: true or false when the guide says so, null when it doesn't. */
  charging: boolean | null;
  halal: HalalStatus | null;
  website: string | null;
  /** The guide entry this came from (article URL + anchor). */
  sourceUrl: string;
  sourceTitle: string;
}

export interface CafeSource {
  title: string;
  url: string;
  count: number;
}

export interface CafesResponse {
  cafes: Cafe[];
  scrapedAt: string;
  sources: CafeSource[];
  /** A refresh failed and this is the last good scrape. */
  stale?: boolean;
}

/** Singapore, roughly: trips centred here get the Cafés tab. */
export function isInSingapore(lat: number, lng: number): boolean {
  return lat >= 1.15 && lat <= 1.48 && lng >= 103.6 && lng <= 104.1;
}

export function formatPriceRange(cafe: Pick<Cafe, 'priceMin' | 'priceMax'>): string | null {
  const { priceMin: min, priceMax: max } = cafe;
  if (min === null || max === null) return null;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return min === max ? `S$${fmt(min)}` : `S$${fmt(min)}–${fmt(max)}`;
}

export const CHARGING_LABEL: Record<'yes' | 'no' | 'unknown', string> = {
  yes: 'Yes',
  no: 'No',
  unknown: 'Not mentioned',
};

export function chargingKey(value: boolean | null): keyof typeof CHARGING_LABEL {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown';
}

export const HALAL_LABEL: Record<HalalStatus, string> = {
  certified: 'Halal-certified',
  'no-pork-lard': 'No pork or lard',
  'not-certified': 'Not halal-certified',
};
