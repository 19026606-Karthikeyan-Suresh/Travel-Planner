import { resolveMapsLink } from '@/lib/places/server';
import { parseUrlLoose } from '@/lib/places/shared';

/**
 * POST /api/places/resolve-url  { "url": "https://maps.app.goo.gl/…" }
 *
 * Turns a pasted Google Maps share link into one addable place (name, address, coordinates,
 * category). Works without a Google key; with one, the place is enriched (address, type, status).
 */
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = ((await request.json()) as { url?: unknown }).url;
  } catch {
    return Response.json({ error: 'Send JSON: { "url": "…" }' }, { status: 400 });
  }
  if (typeof raw !== 'string' || raw.length > 2048) {
    return Response.json({ error: 'url must be a string' }, { status: 400 });
  }
  const url = parseUrlLoose(raw);
  if (!url) return Response.json({ error: 'That doesn’t look like a link' }, { status: 400 });

  try {
    const place = await resolveMapsLink(url);
    return Response.json({ place });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Couldn’t read that link';
    return Response.json({ error: message }, { status: 422 });
  }
}
