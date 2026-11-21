'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, Link2Off, RotateCcw, TriangleAlert } from 'lucide-react';
import type { ShareLinkPreview, UserProfile } from '@/types/trip';
import { AuthScreen } from '@/components/AuthScreen';
import { GuestJoinCard } from '@/components/join/GuestJoinCard';
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
 * Landing page for invites: `/join/K7QM-2XPA` (room code, typed or scanned from the QR) or
 * `/join/<token>` (links made before room codes existed).
 *
 * Signed in → join and open the lobby. Signed out → a display name is enough (guest), or
 * they can sign in with an account; either way they land in the lobby.
 */
export default function JoinTripPage() {
  const params = useParams<{ token: string }>();
  const slug = decodeURIComponent(params.token ?? '');
  const roomCode = isRoomCode(slug) ? formatRoomCode(slug) : null;
  const router = useRouter();

  /** Share-link token behind the code (or the slug itself for old links); null = no such room. */
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShareLinkPreview | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  /** `undefined` until the session has been restored. */
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);
  const [useAccount, setUseAccount] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const accepting = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setLookupError(null);
    void (async () => {
      try {
        const resolved = roomCode ? await resolveRoomCode(roomCode) : slug || null;
        const result: ShareLinkPreview = resolved ? await getShareLinkPreview(resolved) : { valid: false };
        if (cancelled) return;
        setToken(resolved);
        setPreview(result);
      } catch (error) {
        if (cancelled) return;
        setLookupError(errorMessage(error));
        setPreview({ valid: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, roomCode]);

  // Follows sign-in on this page too, so finishing the guest or account form joins automatically.
  // Demo mode has no sessions: everyone gets the display-name step.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser(null);
      return;
    }
    return onAuthChange(setUser);
  }, []);

  const phase =
    preview === null || user === undefined
      ? 'loading'
      : !preview.valid
        ? 'invalid'
        : joinError
          ? 'error'
          : user
            ? 'joining'
            : useAccount
              ? 'account'
              : 'guest';

  const join = useCallback(async () => {
    if (accepting.current || !token) return;
    accepting.current = true;
    try {
      const result = await acceptShareLink(token);
      router.replace(`/lobby/${encodeURIComponent(result.project_id)}`);
    } catch (error) {
      accepting.current = false;
      setJoinError(errorMessage(error));
    }
  }, [token, router]);

  useEffect(() => {
    if (phase === 'joining') void join();
  }, [phase, join]);

  if (phase === 'account' && preview) {
    return <AuthScreen invitePreview={preview} onJoinAsGuest={() => setUseAccount(false)} />;
  }

  return (
    <JoinShell>
      {phase === 'loading' && <Spinner label={roomCode ? `Checking room ${roomCode}…` : 'Checking your invite…'} />}

      {phase === 'guest' && preview && (
        <GuestJoinCard
          preview={preview}
          roomCode={roomCode}
          onSignedIn={setUser}
          onUseAccount={isSupabaseConfigured ? () => setUseAccount(true) : undefined}
        />
      )}

      {phase === 'joining' && (
        <Spinner label={`Joining ${preview?.title ?? 'the trip'}…`} detail={tripLine(preview)} />
      )}

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
          title={`Couldn’t join ${preview?.title ?? 'the trip'}`}
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
  return [preview.destination_name, dates].filter(Boolean).join(' · ') || undefined;
}
