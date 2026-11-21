'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  CircleAlert,
  Copy,
  Crown,
  HardDrive,
  Link2,
  Link2Off,
  LoaderCircle,
  LogOut,
  Mail,
  MailPlus,
  RefreshCw,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import {
  INVITABLE_ROLES,
  ROLE_LABELS,
  canManageMembers,
  type CollaboratorRole,
  type InvitableRole,
  type InviteResult,
  type Project,
  type ProjectInvitation,
  type ProjectMember,
  type ProjectShareLink,
} from '@/types/trip';
import { EMPTY_INVITATIONS, errorMessage, useTripStore } from '@/store/useTripStore';
import {
  enableOrUpdateShareLink,
  getProjectShareLink,
  regenerateShareLink,
  revokeShareLink,
  shareLinkUrl,
} from '@/lib/supabaseClient';
import { Avatar, personName } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_HINTS: Record<CollaboratorRole, string> = {
  owner: 'Full control, including sharing',
  editor: 'Can add, edit and arrange places',
  viewer: 'Can view the plan, but not change it',
};

/* -------------------------------------------------------------------------- */
/*  Modal shell                                                                */
/* -------------------------------------------------------------------------- */

export function CollaboratorsModal({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  // Portalled: the drawer's backdrop-filter would otherwise trap `position: fixed` inside it.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="collaborators"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            className="relative flex max-h-[min(640px,calc(100dvh-32px))] w-full max-w-[500px] flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60"
          >
            <SharePanel project={project} onClose={onClose} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SharePanel({ project, onClose }: { project: Project; onClose: () => void }) {
  const mode = useTripStore((s) => s.mode);
  const user = useTripStore((s) => s.user);
  const status = useTripStore((s) => s.collaboratorsStatus[project.id] ?? 'idle');
  const members = useTripStore((s) => s.collaborators[project.id]) ?? project.members;
  const invitations = useTripStore((s) => s.invitations[project.id] ?? EMPTY_INVITATIONS);
  const loadCollaborators = useTripStore((s) => s.loadCollaborators);
  const isOwner = canManageMembers(project.currentUserRole);

  useEffect(() => {
    void loadCollaborators(project.id);
  }, [project.id, loadCollaborators]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const loadingFirst = status === 'loading' && members.length === 0;

  return (
    <>
      <div className="flex items-start gap-3 border-b border-zinc-800 px-5 pt-5 pb-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25">
          <Users className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="share-title" className="text-base font-semibold tracking-tight">
            Share trip
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-zinc-500">{project.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1.5 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
        {mode === 'demo' ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-[13px] text-amber-100">
            <HardDrive className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p>
              Sharing needs a Supabase connection. Add your project URL and anon key to <code className="text-amber-200">.env.local</code>,
              sign in, and you can invite people by email.
            </p>
          </div>
        ) : isOwner ? (
          <>
            <InviteBar projectId={project.id} />
            <ShareLinkCard projectId={project.id} />
          </>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3.5 py-2.5 text-[13px] text-zinc-400">
            <RoleBadge role={project.currentUserRole} />
            <span className="min-w-0 flex-1">
              {ROLE_HINTS[project.currentUserRole]}. Only the owner can invite people.
            </span>
          </div>
        )}

        <section className="mt-5">
          <SectionHeading label="People with access" count={members.length} busy={status === 'loading' && members.length > 0} />
          {loadingFirst ? (
            <MemberSkeleton />
          ) : members.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-5 text-center text-xs text-zinc-500">
              {mode === 'demo' ? 'Only you, in this browser.' : 'No members found.'}
            </p>
          ) : (
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {members.map((member) => (
                  <MemberRow
                    key={member.user_id}
                    member={member}
                    isSelf={member.user_id === user?.id}
                    canManage={isOwner && member.role_code !== 'owner' && member.user_id !== user?.id}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {(invitations.length > 0 || (isOwner && mode === 'supabase' && status === 'ready')) && (
          <section className="mt-5">
            <SectionHeading label="Pending invitations" count={invitations.length} />
            {invitations.length === 0 ? (
              <p className="px-1 text-xs text-zinc-600">
                Invite someone without an account and they’ll wait here until they sign up.
              </p>
            ) : (
              <ul className="space-y-1">
                <AnimatePresence initial={false}>
                  {invitations.map((invitation) => (
                    <InvitationRow key={invitation.id} invitation={invitation} canRevoke={isOwner} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-zinc-800 px-5 py-3.5">
        {isOwner || mode === 'demo' ? (
          <p className="flex-1 text-[11.5px] leading-snug text-zinc-500">
            <span className="text-zinc-300">Editors</span> can add and arrange places.{' '}
            <span className="text-zinc-300">Viewers</span> can only look.
          </p>
        ) : (
          <LeaveTripButton project={project} onLeft={onClose} />
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-zinc-800 px-3.5 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
        >
          Done
        </button>
      </div>
    </>
  );
}

function SectionHeading({ label, count, busy = false }: { label: string; count: number; busy?: boolean }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
      {label}
      <span className="rounded-full bg-zinc-800 px-1.5 py-px text-[10px] text-zinc-400 tabular-nums normal-case">{count}</span>
      {busy && <LoaderCircle className="size-3 animate-spin text-zinc-600" />}
    </h3>
  );
}

/* -------------------------------------------------------------------------- */
/*  Invite                                                                     */
/* -------------------------------------------------------------------------- */

function InviteBar({ projectId }: { projectId: string }) {
  const inviteCollaborator = useTripStore((s) => s.inviteCollaborator);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('editor');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => setResult(null), 7000);
    return () => window.clearTimeout(timer);
  }, [result]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    const outcome = await inviteCollaborator(projectId, value, role);
    setSubmitting(false);
    if (outcome.ok) {
      setResult(outcome.result);
      setEmail('');
    } else {
      setError(outcome.error);
    }
  };

  return (
    <div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Email address</span>
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="friend@example.com"
            autoComplete="off"
            autoFocus
            aria-invalid={Boolean(error)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 py-2 pr-3 pl-9 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none aria-[invalid=true]:border-rose-500/50"
          />
        </label>
        <div className="flex gap-2">
          <select
            value={role}
            onChange={(e) => setRole(INVITABLE_ROLES.find((r) => r === e.target.value) ?? 'viewer')}
            aria-label="Role"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 text-sm text-zinc-200 focus:border-indigo-500/70 focus:outline-none sm:flex-none"
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-all hover:bg-indigo-500 hover:shadow-[0_0_20px_-6px_rgba(99,102,241,0.85)] disabled:opacity-50 disabled:hover:shadow-none"
          >
            {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <MailPlus className="size-4" />}
            Invite
          </button>
        </div>
      </form>
      <p className="mt-1.5 px-1 text-[11px] text-zinc-600">{ROLE_HINTS[role]}.</p>

      <AnimatePresence initial={false} mode="popLayout">
        {error && (
          <Banner key="error" tone="error" icon={<CircleAlert className="size-4 text-rose-400" />} title="Couldn’t invite">
            {error}
          </Banner>
        )}
        {result && (
          <Banner
            key={`${result.status}:${result.email}`}
            tone={result.status === 'added' ? 'success' : 'pending'}
            icon={
              result.status === 'added' ? (
                <UserCheck className="size-4 text-emerald-400" />
              ) : (
                <Mail className="size-4 text-amber-400" />
              )
            }
            title={
              result.status === 'added'
                ? 'Added to trip'
                : 'Invitation saved — they’ll get access as soon as they sign up with this email'
            }
            onDismiss={() => setResult(null)}
          >
            {result.status === 'added' ? (
              <>
                <span className="font-medium">{result.email}</span> can open this trip now as {ROLE_LABELS[result.role].toLowerCase()}.
              </>
            ) : (
              <>
                <span className="font-medium">{result.email}</span> will join as {ROLE_LABELS[result.role].toLowerCase()}.
              </>
            )}
          </Banner>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shareable invite link                                                      */
/* -------------------------------------------------------------------------- */

type LinkAction = 'create' | 'role' | 'reset' | 'disable';

/** Owner-only card: one URL anyone can use to join, with a role, reset and off switch. */
function ShareLinkCard({ projectId }: { projectId: string }) {
  const [link, setLink] = useState<ProjectShareLink | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [createRole, setCreateRole] = useState<InvitableRole>('viewer');
  const [busy, setBusy] = useState<LinkAction | null>(null);
  const [armed, setArmed] = useState<'reset' | 'disable' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getProjectShareLink(projectId)
      .then((found) => {
        if (cancelled) return;
        setLink(found);
        if (found) setCreateRole(found.role_code);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(null), 3000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const active = link?.is_active ? link : null;
  const url = active ? shareLinkUrl(active.token) : '';

  const run = async (action: LinkAction, task: () => Promise<ProjectShareLink | null>) => {
    setBusy(action);
    setError(null);
    setArmed(null);
    try {
      const next = await task();
      setLink(next);
      if (next) setCreateRole(next.role_code);
      setStatus('ready');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API blocked (insecure origin / permissions): fall back to a selection copy.
      urlRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
  };

  return (
    <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3.5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg ring-1',
            active ? 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/25' : 'bg-zinc-800/80 text-zinc-500 ring-zinc-700/60',
          )}
        >
          <Link2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            Invite link
            {active && (
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-300">
                On
              </span>
            )}
          </p>
          <p className="text-xs text-zinc-500">
            {active ? 'Anyone with this link can join the trip.' : 'Share one link in a group chat instead of inviting each email.'}
          </p>
        </div>
        {active && (
          <div className="-mr-1 flex shrink-0 items-center gap-0.5">
            <LinkIconButton
              label={armed === 'reset' ? 'Click again to reset — the current link stops working' : 'Reset link (the current link stops working)'}
              armed={armed === 'reset'}
              busy={busy === 'reset'}
              onClick={() =>
                armed === 'reset'
                  ? void run('reset', () => regenerateShareLink(projectId, active.role_code))
                  : setArmed('reset')
              }
            >
              <RefreshCw className="size-3.5" />
            </LinkIconButton>
            <LinkIconButton
              label={armed === 'disable' ? 'Click again to turn the link off' : 'Disable link'}
              armed={armed === 'disable'}
              busy={busy === 'disable'}
              danger
              onClick={() =>
                armed === 'disable'
                  ? void run('disable', async () => {
                      await revokeShareLink(projectId);
                      return { ...active, is_active: false };
                    })
                  : setArmed('disable')
              }
            >
              <Link2Off className="size-3.5" />
            </LinkIconButton>
          </div>
        )}
      </div>

      {status === 'loading' ? (
        <div className="mt-3 h-9 animate-pulse rounded-lg bg-zinc-800/60" aria-hidden />
      ) : active ? (
        <div className="mt-3 space-y-2.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 py-1 pr-1 pl-3 focus-within:border-indigo-500/50">
            <input
              ref={urlRef}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invite link"
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-zinc-300 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void copy()}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                copied ? 'bg-emerald-500/15 text-emerald-300' : 'bg-indigo-600 text-white hover:bg-indigo-500',
              )}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Anyone with the link joins as
            <select
              value={active.role_code}
              disabled={busy !== null}
              onChange={(e) => {
                const role = INVITABLE_ROLES.find((r) => r === e.target.value);
                if (role && role !== active.role_code) void run('role', () => enableOrUpdateShareLink(projectId, role));
              }}
              className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-xs text-zinc-200 focus:border-indigo-500/70 focus:outline-none disabled:opacity-60"
            >
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            {busy === 'role' && <LoaderCircle className="size-3.5 animate-spin text-zinc-500" />}
          </label>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={createRole}
            onChange={(e) => setCreateRole(INVITABLE_ROLES.find((r) => r === e.target.value) ?? 'viewer')}
            aria-label="Role for people who join with the link"
            className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 text-sm text-zinc-200 focus:border-indigo-500/70 focus:outline-none sm:w-[118px]"
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy !== null || status === 'error'}
            onClick={() => void run('create', () => enableOrUpdateShareLink(projectId, createRole))}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-500/20 disabled:opacity-50"
          >
            {busy === 'create' ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            {link ? 'Turn invite link back on' : 'Create invite link'}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-xs text-rose-300">
          <CircleAlert className="mt-px size-3.5 shrink-0 text-rose-400" />
          {error}
        </p>
      )}
    </section>
  );
}

function LinkIconButton({
  label,
  armed,
  busy,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  armed: boolean;
  busy: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className={cn(
        'grid size-7 place-items-center rounded-lg transition-colors disabled:opacity-60',
        armed
          ? danger
            ? 'bg-rose-500/15 text-rose-300'
            : 'bg-amber-500/15 text-amber-300'
          : danger
            ? 'text-zinc-500 hover:bg-rose-500/15 hover:text-rose-300'
            : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100',
      )}
    >
      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : armed ? <Check className="size-3.5" /> : children}
    </button>
  );
}

const BANNER_TONES = {
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100',
  pending: 'border-amber-500/25 bg-amber-500/10 text-amber-100',
  error: 'border-rose-500/25 bg-rose-500/10 text-rose-100',
} as const;

function Banner({
  tone,
  icon,
  title,
  onDismiss,
  children,
}: {
  tone: keyof typeof BANNER_TONES;
  icon: React.ReactNode;
  title: string;
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      role={tone === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -4, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -4, height: 0 }}
      transition={{ duration: 0.18 }}
      className="overflow-hidden"
    >
      <div className={cn('mt-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13px]', BANNER_TONES[tone])}>
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1 leading-snug">
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 text-xs opacity-80">{children}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 rounded-md p-0.5 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rows                                                                       */
/* -------------------------------------------------------------------------- */

const rowMotion = {
  layout: true,
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -8 },
  transition: { duration: 0.16 },
} as const;

function MemberRow({ member, isSelf, canManage }: { member: ProjectMember; isSelf: boolean; canManage: boolean }) {
  const updateCollaboratorRole = useTripStore((s) => s.updateCollaboratorRole);
  const removeCollaborator = useTripStore((s) => s.removeCollaborator);
  const [confirming, setConfirming] = useState(false);
  const name = personName(member.profile);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <motion.li {...rowMotion} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-zinc-800/40">
      <Avatar person={member.profile} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-100">
          <span className="truncate">{name}</span>
          {isSelf && <span className="shrink-0 text-xs font-normal text-zinc-500">(you)</span>}
        </p>
        {member.profile.email && <p className="truncate text-xs text-zinc-500">{member.profile.email}</p>}
      </div>

      {canManage && member.role_code !== 'owner' ? (
        <div className="flex shrink-0 items-center gap-1">
          <RoleSelect
            value={member.role_code}
            onChange={(role) => void updateCollaboratorRole(member.project_id, member.user_id, role)}
            label={`Role for ${name}`}
          />
          <button
            type="button"
            onClick={() => (confirming ? void removeCollaborator(member.project_id, member.user_id) : setConfirming(true))}
            title={confirming ? `Confirm remove ${name}` : `Remove ${name}`}
            aria-label={confirming ? `Confirm remove ${name}` : `Remove ${name}`}
            className={cn(
              'grid size-7 place-items-center rounded-lg transition-all',
              confirming
                ? 'bg-rose-500/15 text-rose-300'
                : 'text-zinc-500 opacity-60 group-hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-300 focus-visible:opacity-100',
            )}
          >
            {confirming ? <Check className="size-3.5" /> : <UserMinus className="size-3.5" />}
          </button>
        </div>
      ) : (
        <RoleBadge role={member.role_code} />
      )}
    </motion.li>
  );
}

function InvitationRow({ invitation, canRevoke }: { invitation: ProjectInvitation; canRevoke: boolean }) {
  const revokeInvitation = useTripStore((s) => s.revokeInvitation);

  return (
    <motion.li {...rowMotion} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-zinc-800/40">
      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-zinc-700 text-zinc-500">
        <Mail className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-zinc-200">{invitation.invited_email}</p>
        <p className="text-xs text-zinc-500">Invited as {ROLE_LABELS[invitation.role_code].toLowerCase()}</p>
      </div>
      <span className="shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
        Pending
      </span>
      {canRevoke && (
        <button
          type="button"
          onClick={() => void revokeInvitation(invitation.project_id, invitation.id)}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
        >
          Revoke
        </button>
      )}
    </motion.li>
  );
}

const ROLE_BADGE_CLASSES: Record<CollaboratorRole, string> = {
  owner: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-200',
  editor: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  viewer: 'border-zinc-700 bg-zinc-800/80 text-zinc-300',
};

export function RoleBadge({ role, className }: { role: CollaboratorRole; className?: string }) {
  return (
    <span
      title={ROLE_HINTS[role]}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        ROLE_BADGE_CLASSES[role],
        className,
      )}
    >
      {role === 'owner' && <Crown className="size-3" />}
      {ROLE_LABELS[role]}
    </span>
  );
}

function RoleSelect({
  value,
  onChange,
  label,
}: {
  value: InvitableRole;
  onChange: (role: InvitableRole) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(INVITABLE_ROLES.find((r) => r === e.target.value) ?? value)}
      aria-label={label}
      className={cn(
        'cursor-pointer appearance-none rounded-full border px-2.5 py-0.5 text-center text-[11px] font-medium transition-colors focus:ring-2 focus:ring-indigo-500/30 focus:outline-none',
        ROLE_BADGE_CLASSES[value],
        'hover:brightness-125',
      )}
    >
      {INVITABLE_ROLES.map((r) => (
        <option key={r} value={r} className="bg-zinc-900 text-zinc-100">
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

function LeaveTripButton({ project, onLeft }: { project: Project; onLeft: () => void }) {
  const leaveProject = useTripStore((s) => s.leaveProject);
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3500);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <div className="flex flex-1 items-center gap-2">
      <button
        type="button"
        disabled={leaving}
        onClick={async () => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setLeaving(true);
          const left = await leaveProject(project.id);
          setLeaving(false);
          if (left) onLeft();
        }}
        className={cn(
          'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-60',
          confirming ? 'bg-rose-500/15 text-rose-200' : 'text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300',
        )}
      >
        {leaving ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
        {confirming ? 'Click again to leave' : 'Leave trip'}
      </button>
    </div>
  );
}

function MemberSkeleton() {
  return (
    <div className="space-y-1" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="size-8 animate-pulse rounded-full bg-zinc-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-800" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-zinc-800/60" />
          </div>
          <div className="h-5 w-14 animate-pulse rounded-full bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}
