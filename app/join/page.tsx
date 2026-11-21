'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, QrCode } from 'lucide-react';
import { BrandMark, GlassCard, JoinShell, PrimaryButton } from '@/components/join/JoinUi';
import { ROOM_CODE_LENGTH, formatRoomCode, isRoomCode, normalizeRoomCode } from '@/lib/roomCode';
import { cn } from '@/lib/utils';

/** `/join`: type (or paste) a room code. A valid-looking code goes to `/join/<code>`, which checks it. */
export default function JoinWithCodePage() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [attempted, setAttempted] = useState(false);

  const code = normalizeRoomCode(value);
  const error =
    code.length < ROOM_CODE_LENGTH
      ? `Room codes have ${ROOM_CODE_LENGTH} letters and numbers`
      : isRoomCode(code)
        ? null
        : 'Room codes never use 0, O, 1, I or L. Check for a look-alike character.';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (error) return;
    router.push(`/join/${formatRoomCode(code)}`);
  };

  return (
    <JoinShell>
      <GlassCard>
        <div className="flex flex-col items-center text-center">
          <BrandMark />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Join a trip</h1>
          <p className="mt-1 text-[13px] text-zinc-400">Enter the room code from your invite.</p>
        </div>

        <form onSubmit={submit} noValidate className="mt-6 space-y-3.5">
          <label className="block">
            <span className="sr-only">Room code</span>
            <input
              value={value}
              // Formats as you type; a pasted invite URL collapses to its code.
              onChange={(e) => setValue(formatRoomCode(e.target.value))}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="K7QM-2XPA"
              aria-invalid={attempted && Boolean(error)}
              aria-describedby="room-code-help"
              className={cn(
                'w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3.5 text-center font-mono text-2xl font-semibold tracking-[0.25em] text-zinc-50 uppercase placeholder:text-zinc-700 transition-colors focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none',
                'aria-[invalid=true]:border-rose-500/50',
              )}
            />
            <span id="room-code-help" className={cn('mt-1.5 block text-center text-xs', attempted && error ? 'text-rose-400' : 'text-zinc-500')}>
              {attempted && error ? error : 'Letters and numbers, not case-sensitive'}
            </span>
          </label>

          <PrimaryButton type="submit" className="w-full">
            Continue
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </PrimaryButton>
        </form>

        <p className="mt-5 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-zinc-950/40 px-3 py-2.5 text-xs leading-relaxed text-zinc-400">
          <QrCode className="mt-0.5 size-4 shrink-0 text-zinc-500" />
          Got a QR code instead? Point your phone camera at it and open the link. It brings you straight here.
        </p>
      </GlassCard>

      <Link
        href="/"
        className="absolute top-5 left-5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100"
      >
        <ArrowLeft className="size-3.5" /> Wayfarer
      </Link>
    </JoinShell>
  );
}
