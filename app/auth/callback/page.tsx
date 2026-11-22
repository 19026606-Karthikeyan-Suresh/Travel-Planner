'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { JoinShell, PrimaryButton, Spinner, StatusCard } from '@/components/join/JoinUi';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { safeNextPath } from '@/lib/siteUrl';

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/**
 * Landing page for Supabase auth emails (`emailRedirectTo`). Finishes the session in this
 * browser, then continues to `?next=` (e.g. `/join/K7QM-2XPA`), which must be an in-app path.
 *
 * Handles all three shapes Supabase sends: `?code=` (PKCE), `?token_hash=&type=` (custom
 * email templates) and `#access_token=` (implicit flow). The browser client picks up the
 * code/hash on its own during start-up; we wait for that, then try the explicit call
 * only if it didn't produce a session.
 *
 * The query is read from `window.location` inside the effect rather than `useSearchParams`,
 * which would put the page behind a client-only Suspense boundary for no benefit here.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState('/');

  useEffect(() => {
    let cancelled = false;
    const params = new URL(window.location.href).searchParams;
    const destination = safeNextPath(params.get('next'));
    setNext(destination);
    const finish = () => {
      if (!cancelled) router.replace(destination);
    };

    void (async () => {
      const client = getSupabaseClient();
      if (!client) {
        finish();
        return;
      }

      const reported = params.get('error_description') ?? params.get('error');
      if (reported) {
        if (!cancelled) setError(reported.replace(/\+/g, ' '));
        return;
      }

      try {
        // Waits for the client's own URL detection (PKCE code or hash tokens) to settle.
        const { data } = await client.auth.getSession();
        if (data.session) {
          finish();
          return;
        }

        const code = params.get('code');
        const tokenHash = params.get('token_hash');
        const type = OTP_TYPES.find((t) => t === params.get('type'));
        if (code) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash && type) {
          const { error: verifyError } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
          if (verifyError) throw verifyError;
        }
        finish();
      } catch (err) {
        // Most common cause: the email was opened in a different browser than the one that
        // signed up (PKCE needs both). The address is confirmed either way, so let them sign in.
        const message = err instanceof Error ? err.message : 'Sign-in link could not be used';
        if (!cancelled) setError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <JoinShell>
      {error ? (
        <StatusCard
          tone="error"
          icon={<TriangleAlert className="size-5" />}
          title="That sign-in link didn’t finish"
          body={
            <>
              <p>{error}</p>
              <p className="mt-2 text-xs text-zinc-500">
                If you opened the email on another device, your address is still confirmed. Just sign in here.
              </p>
            </>
          }
        >
          <PrimaryButton onClick={() => router.replace(next)}>
            Continue to sign in <ArrowRight className="size-4" />
          </PrimaryButton>
        </StatusCard>
      ) : (
        <Spinner label="Signing you in…" />
      )}
    </JoinShell>
  );
}
