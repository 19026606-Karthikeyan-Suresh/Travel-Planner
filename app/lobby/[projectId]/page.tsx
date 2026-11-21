'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { UserProfile } from '@/types/trip';
import { Lobby } from '@/components/join/Lobby';
import { JoinShell, Spinner } from '@/components/join/JoinUi';
import { getDemoGuest, isSupabaseConfigured, onAuthChange } from '@/lib/supabaseClient';

/** `/lobby/<tripId>`: where a room code (or invite link) lands after joining. */
export default function LobbyPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId ?? '');
  const router = useRouter();
  /** `undefined` until the session has been restored. */
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser(getDemoGuest());
      return;
    }
    return onAuthChange(setUser);
  }, []);

  // A lobby needs a member: signed-out visitors go and enter a code first.
  const signedOut = isSupabaseConfigured && user === null;
  useEffect(() => {
    if (signedOut) router.replace('/join');
  }, [signedOut, router]);

  if (user === undefined || signedOut) {
    return (
      <JoinShell>
        <Spinner label="Opening the lobby…" />
      </JoinShell>
    );
  }

  return <Lobby projectId={projectId} user={user} />;
}
