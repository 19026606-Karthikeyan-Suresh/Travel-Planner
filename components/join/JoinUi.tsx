'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Compass, LoaderCircle, MapPin } from 'lucide-react';
import { MapBackdrop } from '@/components/AuthScreen';
import { cn, formatDateRangeLong } from '@/lib/utils';

/** Full-screen dark-map stage shared by /join, /join/<code> and /auth/callback. */
export function JoinShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh w-screen items-center justify-center overflow-hidden bg-[#0e0e10] px-4 py-10 text-zinc-100">
      <MapBackdrop />
      {children}
    </main>
  );
}

/** The glass card the sign-in screen uses, so every entry screen looks like one family. */
export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.05 }}
      className={cn('relative w-full max-w-[420px]', className)}
    >
      <div
        className="pointer-events-none absolute -inset-px rounded-[22px] bg-gradient-to-b from-indigo-500/25 via-white/[0.04] to-transparent"
        aria-hidden
      />
      <div className="relative rounded-[21px] border border-white/[0.08] bg-zinc-900/55 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-2xl sm:p-7">
        {children}
      </div>
    </motion.div>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_32px_-6px_rgba(99,102,241,0.9)]',
        className,
      )}
    >
      <Compass className="size-6 text-white" strokeWidth={2.25} />
    </div>
  );
}

/** Title, destination and dates of the trip someone is about to join. */
export function TripSummary({
  title,
  destination,
  startDate,
  endDate,
  className,
}: {
  title?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  className?: string;
}) {
  const dates = startDate && endDate ? formatDateRangeLong(startDate, endDate) : null;
  return (
    <div className={cn('rounded-xl border border-white/[0.06] bg-zinc-950/50 px-4 py-3', className)}>
      <p className="truncate text-[15px] font-semibold tracking-tight text-zinc-50">{title ?? 'A Wayfarer trip'}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
        {destination && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5 shrink-0 text-zinc-500" />
            <span className="truncate">{destination}</span>
          </span>
        )}
        {dates && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5 shrink-0 text-zinc-500" />
            {dates}
          </span>
        )}
      </div>
    </div>
  );
}

export function Spinner({ label, detail }: { label: string; detail?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex flex-col items-center gap-4 text-center"
      role="status"
    >
      <BrandMark />
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

export function StatusCard({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: 'muted' | 'error';
  icon: ReactNode;
  title: string;
  body: ReactNode;
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
      <div className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{body}</div>
      <div className="mt-5 flex justify-center">{children}</div>
    </motion.div>
  );
}

export function PrimaryButton({
  onClick,
  type = 'button',
  disabled = false,
  className,
  children,
}: {
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-indigo-500 hover:shadow-[0_0_28px_-6px_rgba(99,102,241,0.9)] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-indigo-600 disabled:hover:shadow-none',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
    >
      {children}
    </button>
  );
}

export const joinInputClass =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950/60 py-2.5 pr-3 pl-10 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none aria-[invalid=true]:border-rose-500/50';
