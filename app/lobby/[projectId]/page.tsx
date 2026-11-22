'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { JoinShell, Spinner } from '@/components/join/JoinUi';

/**
 * The lobby is gone: joining now lands straight on the trip. Kept only so `/lobby/<tripId>`
 * links people already have (bookmarks, chats) still open the right itinerary.
 */
export default function LobbyRedirect() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = decodeURIComponent(params.projectId ?? '');

  useEffect(() => {
    router.replace(projectId ? `/?trip=${encodeURIComponent(projectId)}` : '/');
  }, [projectId, router]);

  return (
    <JoinShell>
      <Spinner label="Opening your trip…" />
    </JoinShell>
  );
}
