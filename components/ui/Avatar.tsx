'use client';

import type { CSSProperties } from 'react';
import type { UserProfile } from '@/types/trip';
import { cn } from '@/lib/utils';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'size-4 text-[8px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-9 text-sm',
};

type AvatarPerson = Pick<UserProfile, 'email' | 'display_name'> & Partial<Pick<UserProfile, 'id' | 'avatar_url'>>;

/** Display name, or the part of the email before the `@`. */
export function personName(person: AvatarPerson): string {
  return person.display_name?.trim() || person.email.split('@')[0] || 'Traveler';
}

export function initialOf(person: AvatarPerson): string {
  return (personName(person).trim()[0] ?? '?').toUpperCase();
}

/** Stable hue per person so the same collaborator keeps the same colour everywhere. */
function hueOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

export function avatarStyle(person: AvatarPerson): CSSProperties {
  const hue = hueOf(person.id ?? person.email);
  return {
    backgroundImage: `linear-gradient(135deg, hsl(${hue} 72% 58%), hsl(${(hue + 36) % 360} 70% 42%))`,
  };
}

export function Avatar({
  person,
  size = 'md',
  className,
  title,
}: {
  person: AvatarPerson;
  size?: AvatarSize;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white select-none',
        SIZE_CLASSES[size],
        className,
      )}
      style={avatarStyle(person)}
      aria-hidden={title ? undefined : true}
    >
      {person.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatar_url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        initialOf(person)
      )}
    </span>
  );
}

/** Overlapping avatars with a `+N` overflow chip. */
export function AvatarStack({
  people,
  max = 3,
  size = 'sm',
  ringClassName = 'ring-zinc-900',
  className,
}: {
  people: AvatarPerson[];
  max?: number;
  size?: AvatarSize;
  ringClassName?: string;
  className?: string;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className={cn('flex items-center', size === 'xs' ? '-space-x-1' : '-space-x-1.5', className)}>
      {shown.map((person, i) => (
        <Avatar
          key={person.id ?? `${person.email}-${i}`}
          person={person}
          size={size}
          className={cn('ring-2', ringClassName)}
        />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            'grid shrink-0 place-items-center rounded-full bg-zinc-700 font-semibold text-zinc-200 ring-2',
            SIZE_CLASSES[size],
            ringClassName,
          )}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
