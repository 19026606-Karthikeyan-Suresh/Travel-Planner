import { NextResponse } from 'next/server';
import type { CafesResponse } from '@/lib/cafes/types';
import { scrapeEatbook } from '@/lib/cafes/eatbook';
import { geocodeCafes } from '@/lib/cafes/geocode';

// cheerio and the scrape need Node, and the response depends on when it was scraped.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 24 * 60 * 60 * 1000;
/** `?refresh=1` can't re-scrape more often than this, so the endpoint can't be used to hammer Eatbook. */
const MIN_REFRESH_MS = 10 * 60 * 1000;

let cached: { data: CafesResponse; at: number } | null = null;
let inflight: Promise<CafesResponse> | null = null;

async function scrape(): Promise<CafesResponse> {
  const { cafes, sources } = await scrapeEatbook();
  if (cafes.length === 0) {
    throw new Error('Found 0 cafés on Eatbook. The page layout may have changed, so the parser needs updating.');
  }
  return { cafes: await geocodeCafes(cafes), scrapedAt: new Date().toISOString(), sources };
}

function respond(data: CafesResponse, cache: 'HIT' | 'MISS' | 'STALE') {
  return NextResponse.json(data, {
    headers: { 'X-Cafes-Cache': cache, 'Cache-Control': 'public, max-age=300' },
  });
}

/**
 * GET /api/cafes: Singapore cafés scraped from Eatbook, geocoded, cached for 24 hours.
 * A failed re-scrape serves the last good list (`stale: true`) instead of an error.
 */
export async function GET(request: Request) {
  const age = cached ? Date.now() - cached.at : Infinity;
  const wantsRefresh = new URL(request.url).searchParams.get('refresh') === '1' && age > MIN_REFRESH_MS;
  if (cached && age < TTL_MS && !wantsRefresh) return respond(cached.data, 'HIT');

  try {
    inflight ??= scrape().finally(() => {
      inflight = null;
    });
    const data = await inflight;
    cached = { data, at: Date.now() };
    return respond(data, 'MISS');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cafes]', message);
    if (cached) return respond({ ...cached.data, stale: true }, 'STALE');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
