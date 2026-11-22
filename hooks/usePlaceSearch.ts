'use client';

import { useEffect, useState } from 'react';
import { searchPlaces, type PlaceResult } from '@/lib/geocode';
import { isGoogleMapsLink, type PlaceSearchResult, type PlaceSearchResponse } from '@/lib/places/shared';

export type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

interface Options {
  near?: { lat: number; lng: number };
  citiesOnly?: boolean;
  enabled?: boolean;
  debounceMs?: number;
}

/** Debounced, abortable place search. Stale responses are discarded. */
export function usePlaceSearch(query: string, options: Options = {}): { results: PlaceResult[]; status: SearchStatus } {
  const { near, citiesOnly = false, enabled = true, debounceMs = 300 } = options;
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const nearLat = near?.lat;
  const nearLng = near?.lng;

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    const timer = window.setTimeout(() => {
      const bias = nearLat !== undefined && nearLng !== undefined ? { lat: nearLat, lng: nearLng } : undefined;
      searchPlaces(q, { near: bias, citiesOnly, signal: controller.signal })
        .then((found) => {
          setResults(found);
          setStatus('done');
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setStatus('error');
        });
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled, citiesOnly, nearLat, nearLng, debounceMs]);

  return { results, status };
}

const API_MIN_CHARS = 3;
const API_DEBOUNCE_MS = 400;

/**
 * "+ Add a place" search through /api/places/search (Google when configured, else OSM).
 * Debounced to 400ms with a 3-character minimum to spare the API quota; the bias point is
 * rounded to ~1km so neighbours share CDN-cached responses. Skips Maps links (see below).
 */
export function usePlacesApiSearch(
  query: string,
  options: { near?: { lat: number; lng: number }; enabled?: boolean } = {},
): { results: PlaceSearchResult[]; status: SearchStatus; source: 'google' | 'osm' | null } {
  const { near, enabled = true } = options;
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [source, setSource] = useState<'google' | 'osm' | null>(null);
  const lat = near ? near.lat.toFixed(2) : null;
  const lng = near ? near.lng.toFixed(2) : null;

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < API_MIN_CHARS || isGoogleMapsLink(q)) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q });
      if (lat && lng) {
        params.set('lat', lat);
        params.set('lng', lng);
      }
      fetch(`/api/places/search?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Search failed (${response.status})`);
          const body = (await response.json()) as PlaceSearchResponse;
          setResults(body.results);
          setSource(body.source);
          setStatus('done');
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setStatus('error');
        });
    }, API_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled, lat, lng]);

  return { results, status, source };
}

/** Resolves a pasted Google Maps share link to one place, right away (no debounce). */
export function useMapsLinkResolve(
  text: string,
  enabled = true,
): { isLink: boolean; place: PlaceSearchResult | null; status: SearchStatus; error: string | null } {
  const value = text.trim();
  const isLink = enabled && isGoogleMapsLink(value);
  const [place, setPlace] = useState<PlaceSearchResult | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLink) {
      setPlace(null);
      setStatus('idle');
      setError(null);
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    fetch('/api/places/resolve-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: value }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as { place?: PlaceSearchResult; error?: string };
        if (!response.ok || !body.place) throw new Error(body.error ?? 'Couldn’t read that link');
        setPlace(body.place);
        setStatus('done');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setPlace(null);
        setError(err instanceof Error ? err.message : 'Couldn’t read that link');
        setStatus('error');
      });
    return () => controller.abort();
  }, [isLink, value]);

  return { isLink, place, status, error };
}
