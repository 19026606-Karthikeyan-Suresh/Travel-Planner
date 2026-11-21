'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * Small action menu anchored to a button. Portalled with fixed positioning so the
 * sidebar's scroll/overflow clipping can't cut it off; flips above near the bottom.
 */
export function PopoverMenu({
  anchor,
  onClose,
  width = 216,
  label,
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  width?: number;
  label: string;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const rect = anchor.getBoundingClientRect();
    const height = menuRef.current.offsetHeight;
    const below = rect.bottom + GAP;
    const top =
      below + height > window.innerHeight - VIEWPORT_MARGIN ? Math.max(VIEWPORT_MARGIN, rect.top - GAP - height) : below;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - width),
      window.innerWidth - width - VIEWPORT_MARGIN,
    );
    setPosition({ top, left });
  }, [anchor, width]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor?.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [position]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <motion.div
      ref={menuRef}
      role="menu"
      aria-label={label}
      initial={{ opacity: 0, scale: 0.97, y: -2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
        next?.focus();
      }}
      style={{ width, top: position?.top ?? -9999, left: position?.left ?? -9999 }}
      className="fixed z-[60] rounded-xl border border-zinc-700/70 bg-zinc-900/95 p-1 text-zinc-200 shadow-2xl shadow-black/60 backdrop-blur-md"
    >
      {children}
    </motion.div>,
    document.body,
  );
}

export function MenuItem({
  icon,
  label,
  trailing,
  danger = false,
  disabled = false,
  onSelect,
}: {
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus:outline-none disabled:opacity-40',
        // focus-visible: the first item is focused on open, but only keyboard users should see it lit.
        danger
          ? 'text-rose-300 hover:bg-rose-500/15 focus-visible:bg-rose-500/15'
          : 'text-zinc-200 hover:bg-zinc-800 focus-visible:bg-zinc-800',
      )}
    >
      {icon && <span className="grid size-4 shrink-0 place-items-center text-zinc-400">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-medium tracking-wide text-zinc-500 uppercase">{children}</p>;
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-zinc-800" role="separator" />;
}
