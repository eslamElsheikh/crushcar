'use client';

import { ReactNode } from 'react';
import { SearchX, TriangleAlert, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { V2Button } from './Button';

/** Consistent section heading: title + sub, optional trailing action. */
export function V2SectionHeading({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[34px]">
          {title}
        </h2>
        {sub && (
          <p className="mt-2 text-pretty text-[15px] text-[var(--sp-text-muted)] md:text-[16px]">{sub}</p>
        )}
      </div>
      {action && <div className="hidden shrink-0 md:block">{action}</div>}
    </div>
  );
}

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate';

const tones: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  blue: 'bg-[#EFF4FF] text-[#1D5BD8]',
  slate: 'bg-slate-100 text-slate-600',
};

export function V2StatusBadge({
  tone = 'slate',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1.5 text-[12.5px] font-bold',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

function StateShell({
  icon,
  title,
  desc,
  action,
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="v2-card mx-auto max-w-[480px] p-10 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#F1F4F9] text-[#0A1E3C]">
        {icon}
      </span>
      <p className="mt-5 text-balance text-[18px] font-extrabold text-[#0B1B33]">{title}</p>
      {desc && <p className="mx-auto mt-2 max-w-[340px] text-pretty text-[14.5px] text-[var(--sp-text-muted)]">{desc}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Empty state with one clear next action (baseline). */
export function V2EmptyState({
  title,
  desc,
  actionLabel,
  onAction,
}: {
  title: string;
  desc?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <StateShell
      icon={<Inbox className="size-7" />}
      title={title}
      desc={desc}
      action={
        actionLabel && onAction ? (
          <V2Button variant="ghost" onClick={onAction}>
            {actionLabel}
          </V2Button>
        ) : undefined
      }
    />
  );
}

/** Designed error state (never a raw browser error). */
export function V2ErrorState({
  title,
  desc,
  retryLabel,
  onRetry,
}: {
  title: string;
  desc?: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <StateShell
      icon={<TriangleAlert className="size-7" />}
      title={title}
      desc={desc}
      action={
        retryLabel && onRetry ? (
          <V2Button variant="primary" onClick={onRetry}>
            {retryLabel}
          </V2Button>
        ) : undefined
      }
    />
  );
}

/** "No results" variant for search/filter surfaces. */
export function V2NoResults({
  title,
  desc,
  actionLabel,
  onAction,
}: {
  title: string;
  desc?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <StateShell
      icon={<SearchX className="size-7" />}
      title={title}
      desc={desc}
      action={
        actionLabel && onAction ? (
          <V2Button variant="ghost" onClick={onAction}>
            {actionLabel}
          </V2Button>
        ) : undefined
      }
    />
  );
}

/** Structural skeleton block for loading states (baseline). */
export function V2Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('v2-skeleton min-h-[20px] w-full', className)} />;
}

/** Card-shaped skeleton for trip grids. */
export function V2TripCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)]" aria-hidden="true">
      <V2Skeleton className="h-40 rounded-none" />
      <div className="grid gap-3 p-5">
        <V2Skeleton className="h-5 w-2/3" />
        <V2Skeleton className="h-4 w-1/2" />
        <V2Skeleton className="h-6 w-1/3" />
        <V2Skeleton className="h-12 rounded-xl" />
      </div>
    </div>
  );
}
