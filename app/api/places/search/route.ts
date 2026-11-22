import { searchPlacesServer, type LatLng } from '@/lib/places/server';
import type { PlaceSearchResponse } from '@/lib/places/shared';

/**
 * GET /api/places/search?q=nylon coffee&lat=1.28&lng=103.84
 *
 * Google Places (New) when GOOGLE_PLACES_API_KEY is set, Photon/OSM otherwise. Permanently
 * closed places are dropped; temporarily closed ones come back flagged.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const query = params.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 120) {
    return Response.json({ error: 'q must be 2–120 characters' }, { status: 400 });
  }

  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const near: LatLng | null =
    params.has('lat') && params.has('lng') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;

  try {
    const body: PlaceSearchResponse = await searchPlacesServer(query, near);
    return Response.json(body, {
      // Identical searches (same text, same rounded area) are served from the CDN for a few
      // minutes, which keeps paid Google calls down when several people plan the same trip.
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[places/search]', error);
    return Response.json({ error: 'Place search is unavailable right now' }, { status: 502 });
  }
}
