'use client';

import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BadgeCheck, CircleAlert, LoaderCircle, User } from 'lucide-react';
import { ROLE_LABELS, type ShareLinkPreview, type UserProfile } from '@/types/trip';
import { GUEST_NAME_MAX, getDemoGuest, isSupabaseConfigured, signInAsGuest } from '@/lib/supabaseClient';
import { errorMessage } from '@/store/useTripStore';
import { BrandMark, GlassCard, PrimaryButton, TripSummary, joinInputClass } from '@/components/join/JoinUi';

/**
 * Shown to a signed-out visitor holding a valid room code: a display name is all it takes.
 * Signing in as a guest flips the page's auth listener, which then joins and opens the lobby.
 */
export function GuestJoinCard({
  preview,
  roomCode,
  onSignedIn,
  onUseAccount,
}: {
  preview: ShareLinkPreview;
  /** Formatted code (`K7QM-2XPA`) when the visitor came in with one. */
  roomCode: string | null;
  onSignedIn: (profile: UserProfile) => void;
  /** Present when accounts exist (Supabase mode). */
  onUseAccount?: () => void;
}) {
  const [name, setName] = useState(() => (isSupabaseConfigured ? '' : (getDemoGuest()?.display_name ?? '')));
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const nameError = trimmed ? null : 'Enter the name others will see';
  const role = preview.role_code ?? 'viewer';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (nameError || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      onSignedIn(await signInAsGuest(trimmed));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <GlassCard>
      <div className="flex flex-col items-center text-center">
        <BrandMark />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">You’re invited</h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          <span className="text-zinc-200">{preview.owner_name?.trim() || 'A fellow traveler'}</span> asked you to join as{' '}
          {role === 'editor' ? 'an' : 'a'} <span className="font-medium text-indigo-200">{ROLE_LABELS[role].toLowerCase()}</span>.
        </p>
      </div>

      <TripSummary
        className="mt-5"
        title={preview.title}
        destination={preview.destination_name}
        startDate={preview.start_date}
        endDate={preview.end_date}
      />

      {roomCode && (
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-emerald-300/90">
          <BadgeCheck className="size-3.5" />
          Room <span className="font-mono tracking-wider text-emerald-200">{roomCode}</span> is open
        </p>
      )}

      <form onSubmit={submit} noValidate className="mt-5 space-y-3.5">
        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium text-zinc-400">
            Display name
            <span className="text-[11px] font-normal text-zinc-600">Shown to everyone on this trip</span>
          </span>
          <span className="relative block">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-zinc-500">
              <User className="size-4" />
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoComplete="nickname"
              placeholder="e.g. Priya"
              maxLength={GUEST_NAME_MAX}
              aria-invalid={attempted && Boolean(nameError)}
              className={joinInputClass}
            />
          </span>
          {attempted && nameError && <span className="mt-1.5 block text-xs text-rose-400">{nameError}</span>}
        </label>

        <AnimatePresence initial={false}>
          {error && (
            <motion.div
              key="error"
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-[13px] text-rose-200"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-400" />
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Joining…
            </>
          ) : (
            <>
              Enter lobby
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </PrimaryButton>
      </form>

      <p className="mt-5 text-center text-xs leading-relaxed text-zinc-500">
        No account needed: you’ll stay signed in on this device.
        {onUseAccount && (
          <>
            {' '}
            <button type="button" onClick={onUseAccount} className="font-medium text-indigo-300 hover:text-indigo-200">
              Sign in with an account instead
            </button>
          </>
        )}
      </p>
    </GlassCard>
  );
}
