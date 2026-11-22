/**
 * Where this deployment lives, for links that leave the app and come back (auth emails).
 *
 * Browser: the current origin, so preview deployments and custom domains just work.
 * Server: NEXT_PUBLIC_SITE_URL if set, else Vercel's per-deployment host. Never a
 * hardcoded localhost, which is what made confirmation emails bounce users to
 * http://localhost:3000 in production.
 */
export function getSiteUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return '';
}

/**
 * A post-login destination that can only point back into this app: must be a path
 * (`/join/abc`), never `//evil.example` or `https://…`, which would be an open redirect.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // Reject anything a URL parser would read as another origin.
  try {
    const parsed = new URL(value, 'https://wayfarer.invalid');
    if (parsed.origin !== 'https://wayfarer.invalid') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/** `https://<site>/auth/callback?next=/join/abc`: the landing spot for every auth email. */
export function authCallbackUrl(next = '/'): string {
  return `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`;
}
