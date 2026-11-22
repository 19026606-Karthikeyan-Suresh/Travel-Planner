'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, Link2Off, RotateCcw, TriangleAlert } from 'lucide-react';
import type { ShareLinkPreview, UserProfile } from '@/types/trip';
import { AuthScreen } from '@/components/AuthScreen';
import { JoinShell, PrimaryButton, SecondaryButton, Spinner, StatusCard } from '@/components/join/JoinUi';
import {
  acceptShareLink,
  getShareLinkPreview,
  isSupabaseConfigured,
  onAuthChange,
  resolveRoomCode,
} from '@/lib/supabaseClient';
import { formatRoomCode, isRoomCode } from '@/lib/roomCode';
import { errorMessage } from '@/store/useTripStore';
import { formatDateRangeLong } from '@/lib/utils';

/**
 * Invite landing page: `/join/K7QM-2XPA` (room code) or `/join/<token>` (older links).
 *
 * Signed in → join and go straight to the trip's itinerary.
 * Signed out → the sign-in / sign-up form with the invite summary on top; the moment a
 * session exists (password sign-in, instant sign-up, or the email-confirmation round-trip
 * through /auth/callback back to this page) the same join runs.
 */
export default function JoinTripPage() {
  const params = useParams<{ token: string }>();
  const slug = decodeURIComponent(params.token ?? '');
  const roomCode = isRoomCode(slug) ? formatRoomCode(slug) : null;
  const router = useRouter();

  /** Share-link token behind the code (or the slug itself); `undefined` while resolving, null if none. */
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<ShareLinkPreview | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  /** `undefined` until the session has been restored. Demo mode has no accounts: always "in". */
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);
  const [joinError, setJoinError] = useState<string | null>(null);
  const accepting = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resolved = roomCode ? await resolveRoomCode(roomCode) : slug || null;
        if (!cancelled) setToken(resolved);
      } catch (error) {
        if (cancelled) return;
        setLookupError(errorMessage(error));
        setToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, roomCode]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    return onAuthChange(setUser);
  }, []);

  const signedIn = !isSupabaseConfigured || Boolean(user);
  const sessionKnown = !isSupabaseConfigured || user !== undefined;

  // Only signed-out visitors need the preview (for the invite banner); members skip straight to joining.
  useEffect(() => {
    if (!token || !sessionKnown || signedIn) return;
    let cancelled = false;
    getShareLinkPreview(token)
      .then((result) => !cancelled && setPreview(result))
      .catch(() => !cancelled && setPreview({ valid: false }));
    return () => {
      cancelled = true;
    };
  }, [token, sessionKnown, signedIn]);

  const phase =
    token === undefined || !sessionKnown
      ? 'loading'
      : token === null
        ? 'invalid'
        : joinError
          ? 'error'
          : signedIn
            ? 'joining'
            : preview === null
              ? 'loading'
              : !preview.valid
                ? 'invalid'
                : 'auth';

  const join = useCallback(async () => {
    if (accepting.current || !token) return;
    accepting.current = true;
    try {
      const result = await acceptShareLink(token);
      router.replace(`/?trip=${encodeURIComponent(result.project_id)}`);
    } catch (error) {
      accepting.current = false;
      setJoinError(errorMessage(error));
    }
  }, [token, router]);

  useEffect(() => {
    if (phase === 'joining') void join();
  }, [phase, join]);

  if (phase === 'auth' && preview) {
    return <AuthScreen invitePreview={preview} redirectNext={`/join/${encodeURIComponent(slug)}`} />;
  }

  return (
    <JoinShell>
      {phase === 'loading' && <Spinner label={roomCode ? `Checking room ${roomCode}…` : 'Checking your invite…'} />}

      {phase === 'joining' && <Spinner label="Joining trip…" detail={tripLine(preview)} />}

      {phase === 'invalid' && (
        <StatusCard
          tone="muted"
          icon={roomCode ? <KeyRound className="size-5" /> : <Link2Off className="size-5" />}
          title={roomCode ? 'Room not found' : 'Invite link expired or disabled'}
          body={
            <>
              <p>
                {lookupError ??
                  (roomCode ? (
                    <>
                      No open trip uses <span className="font-mono text-zinc-200">{roomCode}</span>. Check the code, or ask the
                      trip owner for a new one.
                    </>
                  ) : (
                    'This link was turned off or replaced by the trip owner. Ask them to send you a fresh one.'
                  ))}
              </p>
              {!isSupabaseConfigured && (
                <p className="mt-2 text-xs text-zinc-500">Demo mode: room codes only work in the browser that created them.</p>
              )}
            </>
          }
        >
          <div className="flex gap-2">
            <SecondaryButton onClick={() => router.push('/join')}>
              <KeyRound className="size-4" /> Try another code
            </SecondaryButton>
            <PrimaryButton onClick={() => router.push('/')}>
              Go to Wayfarer <ArrowRight className="size-4" />
            </PrimaryButton>
          </div>
        </StatusCard>
      )}

      {phase === 'error' && (
        <StatusCard
          tone="error"
          icon={<TriangleAlert className="size-5" />}
          title="Couldn’t join the trip"
          body={joinError ?? 'Something went wrong.'}
        >
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setJoinError(null)}>
              <RotateCcw className="size-4" /> Try again
            </SecondaryButton>
            <PrimaryButton onClick={() => router.push('/')}>
              Go to Wayfarer <ArrowRight className="size-4" />
            </PrimaryButton>
          </div>
        </StatusCard>
      )}
    </JoinShell>
  );
}

function tripLine(preview: ShareLinkPreview | null): string | undefined {
  if (!preview?.valid) return undefined;
  const dates = preview.start_date && preview.end_date ? formatDateRangeLong(preview.start_date, preview.end_date) : null;
  return [preview.title, preview.destination_name, dates].filter(Boolean).join(' · ') || undefined;
}
