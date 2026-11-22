/**
 * Room codes: the short, typeable form of a trip's invite link (`/join/K7QM-2XPA`).
 * Mirrors `public.generate_room_code()` in supabase/migrations/20261122_room_codes.sql.
 */

/** No look-alikes: 0/O, 1/I/L are left out. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 8;

const VALID = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/**
 * Accepts what people actually paste or type: any casing, dashes or spaces, or a whole
 * invite URL (`https://…/join/k7qm-2xpa`). Returns the bare 8-character code, or the
 * cleaned input (possibly invalid) so callers can show what was understood.
 */
export function normalizeRoomCode(input: string): string {
  let value = input.trim();
  const joinPath = value.match(/\/join\/([^/?#\s]+)/i);
  if (joinPath?.[1]) value = decodeURIComponent(joinPath[1]);
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/** True for a well-formed code. It still has to be resolved to know it's a live room. */
export function isRoomCode(input: string): boolean {
  return VALID.test(normalizeRoomCode(input));
}

/** `K7QM2XPA` → `K7QM-2XPA`. Partial input is formatted as far as it goes. */
export function formatRoomCode(input: string): string {
  const code = normalizeRoomCode(input).slice(0, ROOM_CODE_LENGTH);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Client-side generator for demo mode (the database generates real codes). */
export function randomRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}
