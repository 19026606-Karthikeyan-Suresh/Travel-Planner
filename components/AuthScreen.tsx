'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CircleAlert, Compass, Eye, EyeOff, LoaderCircle, Lock, Mail, MailCheck, User } from 'lucide-react';
import { signInWithEmail, signUpWithEmail } from '@/lib/supabaseClient';
import { errorMessage } from '@/store/useTripStore';
import { cn } from '@/lib/utils';

type Mode = 'sign_in' | 'sign_up';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

/** Turns Supabase's terse auth errors into something actionable. */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'That email and password don’t match. Try again or create an account.';
  if (lower.includes('email not confirmed')) return 'Confirm your email first — check your inbox for the link we sent.';
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  return message;
}

/**
 * Email + password gate shown while there is no Supabase session. Success needs no
 * callback: the store's `onAuthStateChange` listener swaps in the workspace.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign_in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const signingUp = mode === 'sign_up';
  const trimmedEmail = email.trim();
  const fieldErrors = {
    email: !trimmedEmail ? 'Enter your email' : EMAIL_PATTERN.test(trimmedEmail) ? null : 'That doesn’t look like an email address',
    password: !password
      ? 'Enter your password'
      : signingUp && password.length < MIN_PASSWORD
        ? `Use at least ${MIN_PASSWORD} characters`
        : null,
  };
  const valid = !fieldErrors.email && !fieldErrors.password;

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setAttempted(false);
    setConfirmationSentTo(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    setConfirmationSentTo(null);
    try {
      if (signingUp) {
        const { needsConfirmation } = await signUpWithEmail(trimmedEmail, password, name);
        if (needsConfirmation) {
          setConfirmationSentTo(trimmedEmail);
          setMode('sign_in');
          setPassword('');
          setAttempted(false);
        }
      } else {
        await signInWithEmail(trimmedEmail, password);
      }
    } catch (err) {
      setError(friendlyAuthError(errorMessage(err)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh w-screen items-center justify-center overflow-hidden bg-[#0e0e10] px-4 py-10 text-zinc-100">
      <MapBackdrop />

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.05 }}
        className="relative w-full max-w-[400px]"
      >
        {/* Soft indigo glow behind the glass. */}
        <div className="pointer-events-none absolute -inset-px rounded-[22px] bg-gradient-to-b from-indigo-500/25 via-white/[0.04] to-transparent" aria-hidden />
        <div className="relative rounded-[21px] border border-white/[0.08] bg-zinc-900/55 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-2xl sm:p-7">
          <div className="flex flex-col items-center text-center">
            <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_32px_-6px_rgba(99,102,241,0.9)]">
              <Compass className="size-6 text-white" strokeWidth={2.25} />
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">
              {signingUp ? 'Start planning with Wayfarer' : 'Welcome back'}
            </h1>
            <p className="mt-1 text-[13px] text-zinc-400">
              {signingUp ? 'Create an account to build and share trips.' : 'Sign in to pick up where your trips left off.'}
            </p>
          </div>

          <div role="tablist" aria-label="Account" className="mt-6 grid grid-cols-2 rounded-xl border border-white/[0.06] bg-zinc-950/60 p-1">
            {(
              [
                ['sign_in', 'Sign in'],
                ['sign_up', 'Create account'],
              ] as const
            ).map(([id, label]) => {
              const active = id === mode;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchMode(id)}
                  className={cn(
                    'relative rounded-lg py-1.5 text-[13px] font-medium transition-colors',
                    active ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="auth-mode"
                      className="absolute inset-0 rounded-lg border border-zinc-700/60 bg-zinc-800 shadow-sm"
                      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                    />
                  )}
                  <span className="relative">{label}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} noValidate className="mt-5 space-y-3.5">
            <AnimatePresence initial={false}>
              {confirmationSentTo && (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-[13px] text-emerald-200">
                    <MailCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    <p>
                      Check <span className="font-medium text-emerald-100">{confirmationSentTo}</span> for a confirmation link, then
                      sign in here.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {signingUp && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <AuthField label="Name" hint="Optional · shown to collaborators" icon={<User className="size-4" />}>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      placeholder="Alex Rivera"
                      maxLength={60}
                      className={inputClass}
                    />
                  </AuthField>
                </motion.div>
              )}
            </AnimatePresence>

            <AuthField label="Email" icon={<Mail className="size-4" />} error={attempted ? fieldErrors.email : null}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                aria-invalid={attempted && Boolean(fieldErrors.email)}
                className={inputClass}
              />
            </AuthField>

            <AuthField label="Password" icon={<Lock className="size-4" />} error={attempted ? fieldErrors.password : null}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={signingUp ? 'new-password' : 'current-password'}
                placeholder={signingUp ? `At least ${MIN_PASSWORD} characters` : '••••••••'}
                aria-invalid={attempted && Boolean(fieldErrors.password)}
                className={cn(inputClass, 'pr-10')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </AuthField>

            <AnimatePresence initial={false}>
              {error && (
                <motion.div
                  key="error"
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-start gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-[13px] text-rose-200"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-400" />
                  <p>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={submitting}
              className="group mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-[0_0_28px_-6px_rgba(99,102,241,0.9)] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  {signingUp ? 'Creating account…' : 'Signing in…'}
                </>
              ) : (
                <>
                  {signingUp ? 'Create account' : 'Sign in'}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-xs leading-relaxed text-zinc-500">
            {signingUp ? (
              <>
                Invited to a trip? Sign up with the email the invite went to and it will be waiting for you.
              </>
            ) : (
              <>
                New here?{' '}
                <button type="button" onClick={() => switchMode('sign_up')} className="font-medium text-indigo-300 hover:text-indigo-200">
                  Create an account
                </button>
              </>
            )}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950/60 py-2.5 pr-3 pl-10 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none aria-[invalid=true]:border-rose-500/50';

function AuthField({
  label,
  hint,
  icon,
  error,
  children,
}: {
  label: string;
  hint?: string;
  icon: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium text-zinc-400">
        {label}
        {hint && <span className="truncate text-[11px] font-normal text-zinc-600">{hint}</span>}
      </span>
      <span className="relative block">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-zinc-500">{icon}</span>
        {children}
      </span>
      {error && <span className="mt-1.5 block text-xs text-rose-400">{error}</span>}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*  Decorative dark-map backdrop                                               */
/* -------------------------------------------------------------------------- */

const ROUTES = [
  { color: '#6366f1', d: 'M180 640 C 320 560, 420 600, 520 500 S 700 360, 860 400 S 1040 520, 1180 430' },
  { color: '#10b981', d: 'M260 220 C 380 260, 460 200, 600 250 S 780 330, 900 250' },
  { color: '#f59e0b', d: 'M980 720 C 1060 640, 1120 660, 1220 600 S 1320 520, 1380 560' },
];

const STOPS = [
  { x: 180, y: 640, color: '#6366f1', n: 1 },
  { x: 520, y: 500, color: '#6366f1', n: 2 },
  { x: 860, y: 400, color: '#6366f1', n: 3 },
  { x: 1180, y: 430, color: '#6366f1', n: 4 },
  { x: 260, y: 220, color: '#10b981', n: 1 },
  { x: 600, y: 250, color: '#10b981', n: 2 },
  { x: 900, y: 250, color: '#10b981', n: 3 },
  { x: 980, y: 720, color: '#f59e0b', n: 1 },
  { x: 1220, y: 600, color: '#f59e0b', n: 2 },
];

/** Static stand-in for the basemap so the sign-in screen feels like the app it opens. */
function MapBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <svg className="absolute inset-0 size-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="auth-streets" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
            <path d="M0 0H64M0 0V64" stroke="#27272a" strokeWidth="1" opacity="0.55" />
          </pattern>
          <filter id="auth-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <rect width="1440" height="900" fill="#0e0e10" />
        {/* Water */}
        <path d="M0 760 C 180 700, 300 820, 520 790 S 820 860, 1000 900 L 0 900 Z" fill="#0b1220" />
        <path d="M1440 0 L 1440 260 C 1320 300, 1240 200, 1160 160 S 1080 40, 1040 0 Z" fill="#0b1220" />
        <rect width="1440" height="900" fill="url(#auth-streets)" />
        {/* Arterials */}
        <g stroke="#3f3f46" strokeWidth="2.5" fill="none" opacity="0.55">
          <path d="M-20 420 C 300 380, 700 470, 1460 360" />
          <path d="M420 -20 C 460 300, 380 600, 470 920" />
          <path d="M1040 -20 C 980 260, 1100 600, 1010 920" />
        </g>
        {/* Day routes */}
        {ROUTES.map((route, i) => (
          <g key={route.color}>
            <path d={route.d} stroke={route.color} strokeWidth="10" fill="none" opacity="0.12" filter="url(#auth-glow)" />
            <motion.path
              d={route.d}
              stroke={route.color}
              strokeWidth="2.5"
              strokeDasharray="10 8"
              fill="none"
              opacity={0.75}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.8, delay: 0.25 + i * 0.25, ease: 'easeInOut' }}
            />
          </g>
        ))}
        {STOPS.map((stop, i) => (
          <motion.g
            key={`${stop.x}-${stop.y}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 + i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}
            style={{ transformOrigin: `${stop.x}px ${stop.y}px` }}
          >
            <circle cx={stop.x} cy={stop.y} r="22" fill={stop.color} opacity="0.18" filter="url(#auth-glow)" />
            <circle cx={stop.x} cy={stop.y} r="13" fill={stop.color} stroke="#09090b" strokeWidth="3" />
            <text x={stop.x} y={stop.y + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff" fontFamily="inherit">
              {stop.n}
            </text>
          </motion.g>
        ))}
      </svg>
      {/* Mute the map and pull focus to the card. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(9,9,11,0.55)_0%,rgba(9,9,11,0.82)_55%,rgba(9,9,11,0.96)_100%)]" />
      <div className="absolute top-1/2 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[110px]" />
    </div>
  );
}
