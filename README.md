# Wayfarer — trip planner

A three-pane trip planner: trip list on the left, a day-by-day itinerary drawer, and a full-bleed MapLibre map. Built with Next.js 16 (App Router), Tailwind 4, Zustand, dnd-kit, framer-motion and Supabase.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

- **With Supabase:** copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The app reads and writes `public.projects` and `public.project_pins` directly with the anon key. It expects the dev-mode RLS policies to allow anon reads and writes, and there is no login screen.
- **Without env vars:** the app runs in demo mode. Seed trips are kept in `localStorage`, and the reset button in the sidebar footer restores them.

The basemap is CartoDB Dark Matter and place search uses Photon (OpenStreetMap). Neither needs an API key.

## Layout

| Path | What it does |
| --- | --- |
| `types/trip.ts` | `Project`, `ProjectPin`, `PinCategory` and input types, 1:1 with the SQL schema |
| `lib/supabaseClient.ts` | Typed Supabase client, the `TripService` CRUD contract, and the Supabase and localStorage implementations |
| `store/useTripStore.ts` | Zustand store: projects, per-project pins, hover/selection, day filter, camera commands, and optimistic writes through a serialized queue with rollback |
| `lib/itinerary.ts` | Days derived from `start_date`/`end_date` with `eachDayOfInterval`, grouping pins into day and Saved Places buckets, day colors |
| `lib/geocode.ts` | Photon search and reverse geocoding |
| `app/api/cafes/route.ts`, `lib/cafes/*` | Eatbook café scraper (`eatbook.ts`), text rules (`classify.ts`), geocoding, CSV export |
| `components/workspace/CafesPanel.tsx` | Cafés tab: filters, map focus, add to trip, CSV export |
| `components/PrimarySidebar.tsx` | Trip list (upcoming and past), search, sync status, and the New Trip modal |
| `components/SecondarySidebar.tsx` | Slide-out drawer: header with editable title and dates, and the Itinerary, Saved Places and Budget tabs |
| `components/workspace/*` | Pin cards, the drag-and-drop board, inline place search, budget breakdown |
| `components/MapCanvas.tsx` | Numbered markers, dashed day routes, day filter, click-to-drop popup, ResizeObserver and auto-framing |
| `app/page.tsx` | Three-pane viewport |

## Behaviour notes

- New rows use client-generated UUIDs, so optimistic records never need an id swap after the insert.
- Writes run in order through a single queue. If a write fails, the change is rolled back and an error toast appears.
- Shrinking a trip's date range moves pins from the removed days to Saved Places.
- Markers can be dragged to correct a location. Clicking a marker opens and scrolls to its card.
- Responsive layout:
  - **≥1280px:** both sidebars are docked.
  - **1024–1279px:** the trips sidebar starts collapsed and can be docked open.
  - **768–1023px:** the trips sidebar slides over the page.
  - **<768px:** the itinerary is a full-screen sheet, and a floating Map / Itinerary button switches between it and the map.

## Singapore cafés

Trips centred in Singapore get a **Cafés** tab. It lists cafés scraped from two Eatbook guides ([best cafés](https://eatbook.sg/best-cafes-singapore/) and [quiet cafés](https://eatbook.sg/quiet-cafes/), the second for charging ports). Each café shows its area, address, opening hours, price range, café type, and whether it has charging ports. Filter by type, price tier or charging ports, or search by name, area or street. The listed cafés also appear as amber pins on the map, and clicking a café (in the list or on the map) highlights it in both places and flies the map to it. **Add to Saved Places** turns a café into a trip pin. **Export CSV** downloads the filtered list.

- `GET /api/cafes` scrapes on the server, geocodes with OneMap (keyless; postal code first) and Photon as a fallback, and caches the result in memory for 24 hours. `?refresh=1` re-scrapes, at most once every 10 minutes. If a refresh fails, the last good list is served with `stale: true`.
- Only facts are kept: name, address, hours, prices, type, charging ports, halal status and a link back to the guide entry. No article text is copied.
- Values are derived from each café's write-up. The price range spans the dish prices quoted, and the `$`/`$$`/`$$$` tier comes from the median dish (≤ S$10, ≤ S$25, above). Types come from keyword rules. Charging ports are yes or no only when the guide says so, and unknown otherwise (including "only at other branches").
- If Eatbook changes its page layout and the parser finds no cafés, the API returns an error rather than an empty list.
