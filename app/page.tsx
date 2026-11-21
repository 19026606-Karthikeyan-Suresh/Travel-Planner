'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { Compass } from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { PrimarySidebar } from '@/components/PrimarySidebar';
import { SecondarySidebar } from '@/components/SecondarySidebar';
import { Toaster } from '@/components/Toaster';
import { useViewportSync } from '@/hooks/useViewport';
import { useTripStore } from '@/store/useTripStore';

// MapLibre touches `window` on import, so the canvas is client-only.
const MapCanvas = dynamic(() => import('@/components/MapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-[#0e0e10]">
      <div className="size-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-500" />
    </div>
  ),
});

/**
 * Enter-only fade. The gate deliberately avoids `AnimatePresence mode="wait"`: the auth
 * state can flip right after hydration, and a stalled exit would strand the splash on screen.
 */
const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.25 },
} as const;

export default function Home() {
  const startAuth = useTripStore((s) => s.startAuth);
  const authStatus = useTripStore((s) => s.authStatus);
  const userId = useTripStore((s) => s.user?.id ?? null);
  useViewportSync();

  // Restores the session, then follows sign-in / sign-out without reloading the page.
  useEffect(() => startAuth(), [startAuth]);

  return (
    <>
      {authStatus === 'loading' && (
        <div className="grid h-dvh w-screen place-items-center bg-zinc-950">
          <div className="flex flex-col items-center gap-4">
            <div className="grid size-11 animate-pulse place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_32px_-6px_rgba(99,102,241,0.9)]">
              <Compass className="size-6 text-white" strokeWidth={2.25} />
            </div>
            <div className="size-5 animate-spin rounded-full border-2 border-zinc-800 border-t-indigo-500" />
          </div>
        </div>
      )}

      {authStatus === 'signed_out' && (
        <motion.div key="auth" {...fadeIn}>
          <AuthScreen />
        </motion.div>
      )}

      {(authStatus === 'signed_in' || authStatus === 'disabled') && (
        // Keyed by account so a different user never sees the previous user's map state.
        <motion.main
          key={`app:${userId ?? 'demo'}`}
          {...fadeIn}
          className="relative flex h-dvh w-screen overflow-hidden bg-zinc-950 text-zinc-100"
        >
          <PrimarySidebar />
          <SecondarySidebar />
          <section className="relative z-10 h-full min-w-0 flex-1" aria-label="Map">
            <MapCanvas />
          </section>
        </motion.main>
      )}

      <Toaster />
    </>
  );
}
