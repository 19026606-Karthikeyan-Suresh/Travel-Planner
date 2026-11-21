'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, DoorOpen, Users } from 'lucide-react';
import { ROLE_LABELS, type CollaboratorRole, type Project, type ProjectMember, type UserProfile } from '@/types/trip';
import { getProjectById, getProjectCollaborators, getSupabaseClient } from '@/lib/supabaseClient';
import { Avatar, personName } from '@/components/ui/Avatar';
import { errorMessage } from '@/store/useTripStore';
import { cn } from '@/lib/utils';
import { GlassCard, JoinShell, PrimaryButton, Spinner, StatusCard, TripSummary } from '@/components/join/JoinUi';

interface LobbyPerson {
  id: string;
  profile: Pick<UserProfile, 'id' | 'email' | 'display_name' | 'avatar_url'>;
  role: CollaboratorRole;
  isYou: boolean;
  guest: boolean;
}

/** Members with you pinned first; you're added even before your membership row shows up. */
function lobbyPeople(members: ProjectMember[], user: UserProfile | null, yourRole: CollaboratorRole): LobbyPerson[] {
  const people: LobbyPerson[] = members.map((m) => ({
    id: m.user_id,
    profile: m.profile,
    role: m.role_code,
    isYou: m.user_id === user?.id,
    // Profiles carry no auth flags; guests are the members without an email.
    guest: m.user_id === user?.id ? Boolean(user?.is_anonymous) : !m.profile.email,
  }));
  if (!people.some((p) => p.isYou)) {
    people.unshift({
      id: user?.id ?? 'you',
      profile: user ?? { id: 'you', email: '', display_name: 'You', avatar_url: null },
      role: yourRole,
      isYou: true,
      guest: Boolean(user?.is_anonymous),
    });
  }
  return [...people.filter((p) => p.isYou), ...people.filter((p) => !p.isYou)];
}

/**
 * Waiting room between joining and the workspace: the trip, who's on it, and who's in the
 * lobby right now (Supabase Realtime presence). New members appear as they join.
 */
export function Lobby({ projectId, user }: { projectId: string; user: UserProfile | null }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [online, setOnline] = useState<ReadonlySet<string>>(() => new Set());
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;

  const refreshMembers = useCallback(async () => {
    try {
      const result = await getProjectCollaborators(projectId);
      if (result.members.length > 0) setMembers(result.members);
    } catch (err) {
      console.warn('[lobby members]', errorMessage(err));
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    getProjectById(projectId, user)
      .then((found) => {
        if (cancelled) return;
        setProject(found);
        if (found) setMembers(found.members);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setProject(null);
      });
    void refreshMembers();
    return () => {
      cancelled = true;
    };
    // Same account → same trip view; a token refresh shouldn't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId, refreshMembers]);

  const ready = Boolean(project);

  // Presence: who has the lobby open. postgres_changes: membership rows as people join.
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !user || !ready) return;
    const channel = client.channel(`lobby:${projectId}`, { config: { presence: { key: user.id } } });
    channel
      .on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .on('presence', { event: 'join' }, () => void refreshMembers())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_members', filter: `project_id=eq.${projectId}` },
        () => void refreshMembers(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setLive(true);
          void channel.track({ name: personName(user) });
        }
      });
    return () => {
      setLive(false);
      void client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId, ready, refreshMembers]);

  const people = useMemo(
    () => (project ? lobbyPeople(members, user, project.currentUserRole) : []),
    [members, user, project],
  );

  if (project === undefined) {
    return (
      <JoinShell>
        <Spinner label="Opening the lobby…" />
      </JoinShell>
    );
  }

  if (project === null) {
    return (
      <JoinShell>
        <StatusCard
          tone="muted"
          icon={<DoorOpen className="size-5" />}
          title="This trip isn’t available"
          body={error ?? 'You may have left it, or the owner removed you. Ask them for a new room code.'}
        >
          <PrimaryButton onClick={() => router.push('/')}>
            Go to Wayfarer <ArrowRight className="size-4" />
          </PrimaryButton>
        </StatusCard>
      </JoinShell>
    );
  }

  const hereNow = people.filter((p) => online.has(p.id)).length;
  const name = user ? personName(user) : null;
  const supabase = Boolean(getSupabaseClient());

  return (
    <JoinShell>
      <GlassCard className="max-w-[460px]">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            <span className="relative flex size-1.5">
              <span
                className={cn('absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60', live && 'animate-ping')}
              />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
            </span>
            Lobby
          </span>
          <span className="text-xs text-zinc-500">
            You’re in as {project.currentUserRole === 'editor' ? 'an' : 'a'}{' '}
            <span className="font-medium text-indigo-200">{ROLE_LABELS[project.currentUserRole].toLowerCase()}</span>
          </span>
        </div>

        <h1 className="mt-4 text-xl font-semibold tracking-tight">{name ? `Welcome, ${name}` : 'Welcome aboard'}</h1>
        <p className="mt-1 text-[13px] text-zinc-400">Here’s who’s on this trip. Head in whenever you’re ready.</p>

        <TripSummary
          className="mt-4"
          title={project.title}
          destination={project.destination_name}
          startDate={project.start_date}
          endDate={project.end_date}
        />

        <section className="mt-5" aria-label="Travelers">
          <div className="mb-1.5 flex items-center justify-between px-1 text-xs font-medium text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" /> Travelers · {people.length}
            </span>
            {live && hereNow > 0 && <span className="text-emerald-300/90">{hereNow} in the lobby</span>}
          </div>
          <ul className="scrollbar-thin -mx-1 max-h-[252px] space-y-0.5 overflow-y-auto px-1">
            {people.map((person, i) => {
              const here = online.has(person.id);
              return (
                <motion.li
                  key={person.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.04 }}
                  className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2', person.isYou ? 'bg-indigo-500/[0.07]' : 'hover:bg-white/[0.03]')}
                >
                  <span className="relative">
                    <Avatar person={person.profile} size="lg" />
                    {here && (
                      <span
                        className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-zinc-900 bg-emerald-400"
                        title="In the lobby now"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-100">
                      <span className="truncate">{personName(person.profile)}</span>
                      {person.isYou && (
                        <span className="shrink-0 rounded bg-indigo-500/20 px-1.5 py-px text-[10px] font-medium text-indigo-200">You</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {ROLE_LABELS[person.role]}
                      {person.guest && ' · guest'}
                    </p>
                  </div>
                  {here && <span className="shrink-0 text-[11px] text-emerald-300/80">here now</span>}
                </motion.li>
              );
            })}
          </ul>
          {!supabase && (
            <p className="mt-2 px-1 text-[11px] leading-relaxed text-zinc-500">
              Demo mode: other travelers show up here live once Wayfarer is connected to Supabase.
            </p>
          )}
        </section>

        <PrimaryButton className="mt-6 w-full" onClick={() => router.push(`/?trip=${encodeURIComponent(project.id)}`)}>
          Enter trip
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </PrimaryButton>
      </GlassCard>
    </JoinShell>
  );
}
