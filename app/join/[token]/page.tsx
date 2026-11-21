'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Compass, Link2Off, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react';
import type { ShareLinkPreview, UserProfile } from '@/types/trip';
import { AuthScreen } from '@/components/AuthScreen';
import { acceptShareLink, getShareLinkPreview, isSupabaseConfigured, onAuthChange } from '@/lib/supabaseClient';
import { errorMessage } from '@/store/useTripStore';
import { formatDateRangeLong } from '@/lib/utils';

/**
 * Landing page for shareable invite links. Signed in → join and jump to the trip.
 * Signed out → the auth form with an invite banner, then the same once they're in.
 */
export default function JoinTripPage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params.token ?? '');
  const router = useRouter();

  const [preview, setPreview] = useState<ShareLinkPreview | null>(null);
  /** `undefined` until the session has been restored. */
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);
  const [joinError, setJoinError] = useState<string | null>(null);
  const accepting = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getShareLinkPreview(token)
      .then((result) => !cancelled && setPreview(result))
      .catch(() => !cancelled && setPreview({ valid: false }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Follows sign-in on this page too, so finishing the auth form joins automatically.
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
            : 'auth';

  const join = useCallback(async () => {
    if (accepting.current) return;
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

  if (phase === 'auth' && preview) return <AuthScreen invitePreview={preview} />;

  return (
    <main className="relative grid min-h-dvh w-screen place-items-center overflow-hidden bg-zinc-950 px-4 text-zinc-100">
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[110px]" />

      {phase === 'loading' && <Spinner label="Checking your invite…" />}

      {phase === 'joining' && (
        <Spinner label={`Joining ${preview?.title ?? 'the trip'}…`} detail={tripLine(preview)} />
      )}

      {phase === 'invalid' && (
        <StatusCard
          tone="muted"
          icon={<Link2Off className="size-5" />}
          title="Invite link expired or disabled"
          body={
            isSupabaseConfigured
              ? 'This link was turned off or replaced by the trip owner. Ask them to send you a fresh one.'
              : 'Invite links need Wayfarer to be connected to Supabase.'
          }
        >
          <PrimaryButton onClick={() => router.push('/')}>
            Go to Wayfarer <ArrowRight className="size-4" />
          </PrimaryButton>
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
            <button
              type="button"
              onClick={() => setJoinError(null)}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
            >
              <RotateCcw className="size-4" /> Try again
            </button>
            <PrimaryButton onClick={() => router.push('/')}>
              Go to Wayfarer <ArrowRight className="size-4" />
            </PrimaryButton>
          </div>
        </StatusCard>
      )}
    </main>
  );
}

function tripLine(preview: ShareLinkPreview | null): string | undefined {
  if (!preview?.valid) return undefined;
  const dates = preview.start_date && preview.end_date ? formatDateRangeLong(preview.start_date, preview.end_date) : null;
  return [preview.destination_name, dates].filter(Boolean).join(' · ') || undefined;
}

function Spinner({ label, detail }: { label: string; detail?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex flex-col items-center gap-4 text-center"
      role="status"
    >
      <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_32px_-6px_rgba(99,102,241,0.9)]">
        <Compass className="size-6 text-white" strokeWidth={2.25} />
      </div>
      <div>
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-zinc-200">
          <LoaderCircle className="size-4 animate-spin text-indigo-400" />
          {label}
        </p>
        {detail && <p className="mt-1 text-xs text-zinc-500">{detail}</p>}
      </div>
    </motion.div>
  );
}

function StatusCard({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: 'muted' | 'error';
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="relative w-full max-w-[400px] rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl"
    >
      <span
        className={
          tone === 'error'
            ? 'mx-auto grid size-11 place-items-center rounded-xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/25'
            : 'mx-auto grid size-11 place-items-center rounded-xl bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700'
        }
      >
        {icon}
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{body}</p>
      <div className="mt-5 flex justify-center">{children}</div>
    </motion.div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-indigo-500 hover:shadow-[0_0_28px_-6px_rgba(99,102,241,0.9)]"
    >
      {children}
    </button>
  );
}
