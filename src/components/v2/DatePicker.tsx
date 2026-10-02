'use client';

import { useEffect, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { formatFullAr } from '@/lib/search-ar';
import { useIsMobile } from './useMediaQuery';

const AR_DAYS = ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح']; // Sat..Fri (ar-EG week starts Saturday)

const fmtDay = new Intl.DateTimeFormat('ar-EG', { day: '2-digit' });
const fmtMonthYear = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' });

function toISO(y: number, m: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(m + 1)}-${p(d)}`;
}

interface V2DatePickerProps {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  label: string;
  placeholder?: string;
  /** DOM id of the trigger (validation focus / focus chaining). */
  id?: string;
  /** Focus this element id after a date is picked. */
  nextId?: string;
  /** Range highlight: start/end ISO dates (inclusive). */
  rangeStart?: string | null;
  rangeEnd?: string | null;
  /** Disable the trigger entirely (e.g. return date before departure is set). */
  disabled?: boolean;
  /** Field-level validation state (red ring via .v2-input[aria-invalid]). */
  invalid?: boolean;
  /** Controlled open state (e.g. auto-open return after departure pick). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Arabic date picker: full Arabic label, native value stays yyyy-mm-dd. */
export function V2DatePicker({
  value,
  onChange,
  min,
  max,
  label,
  placeholder,
  id,
  nextId,
  rangeStart,
  rangeEnd,
  disabled,
  invalid,
  open: controlledOpen,
  onOpenChange,
}: V2DatePickerProps) {
  const lang = useLangStore((s) => s.lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const isMobile = useIsMobile();
  const now = new Date();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;

  function setOpen(next: boolean) {
    if (disabled) return;
    if (onOpenChange) onOpenChange(next);
    else setInnerOpen(next);
  }

  // Escape closes the mobile sheet (Radix handles it on desktop).
  useEffect(() => {
    if (!open || !isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isMobile ]);

  const [view, setView] = useState(() => {
    const v = value ? new Date(value + 'T12:00:00') : now;
    return isNaN(v.getTime()) ? { y: now.getFullYear(), m: now.getMonth() } : { y: v.getFullYear(), m: v.getMonth() };
  });

  // Keep the viewed month in sync when value/min change from outside.
  useEffect(() => {
    const src = value || min;
    if (!src) return;
    const v = new Date(src + 'T12:00:00');
    if (!isNaN(v.getTime())) setView({ y: v.getFullYear(), m: v.getMonth() });
  }, [value, min ]);

  const display = value ? formatFullAr(value) : '';

  // Single month view; navigation is clamped between floor and ceiling months.
  function ymIndex(y: number, m: number) {
    return y * 12 + m;
  }
  const nowIdx = ymIndex(now.getFullYear(), now.getMonth());
  function monthIndex(iso?: string) {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d.getTime()) ? null : ymIndex(d.getFullYear(), d.getMonth());
  }
  const floorIdx = monthIndex(min) ?? nowIdx;
  const ceilIdx = monthIndex(max);
  const viewIdx = ymIndex(view.y, view.m);

  function shift(dirn: -1 | 1) {
    setView((v) => {
      const from = ymIndex(v.y, v.m);
      const target = from + dirn;
      if (target < floorIdx) return v;
      if (ceilIdx !== null && target > ceilIdx) return v;
      const m = v.m + dirn;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }

  const canPrev = viewIdx > floorIdx;
  const canNext = ceilIdx === null || viewIdx < ceilIdx;

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
    if (nextId) requestAnimationFrame(() => document.getElementById(nextId)?.focus());
  }

  function monthGrid(y: number, m: number) {
    const firstDow = new Date(y, m, 1).getDay(); // 0=Sun..6=Sat
    const offset = (firstDow + 1) % 7; // ar-EG week starts Saturday
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    return { offset, daysInMonth };
  }

  function renderMonth(y: number, m: number) {
    const { offset, daysInMonth } = monthGrid(y, m);
    return (
      <div className="min-w-0 flex-1">
        <p className="text-center text-[15px] font-extrabold text-[#0B1B33]">
          {fmtMonthYear.format(new Date(y, m, 1))}
        </p>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center" aria-hidden="true">
          {AR_DAYS.map((d) => (
            <span key={d} className="py-1 text-[12px] font-bold text-[#9AA8BD]">{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1" role="grid">
          {Array.from({ length: offset }, (_, i) => (
            <span key={`e-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const iso = toISO(y, m, d);
            const outOfBounds = (!!min && iso < min) || (!!max && iso > max);
            const selected = iso === value;
            const inRange =
              !!rangeStart && !!rangeEnd && iso > rangeStart && iso < rangeEnd;
            const isEndpoint = iso === rangeStart || iso === rangeEnd;
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                disabled={outOfBounds}
                aria-selected={selected || isEndpoint}
                aria-label={formatFullAr(iso)}
                onClick={() => pick(iso)}
                className={cn(
                  'grid size-10 w-full place-items-center rounded-xl text-[14px] tabular-nums transition',
                  selected || isEndpoint
                    ? 'bg-[#1D5BD8] font-extrabold text-white'
                    : inRange
                      ? 'bg-[#EFF4FF] font-bold text-[#1D5BD8]'
                      : 'font-semibold text-[#0B1B33] hover:bg-[#EFF4FF]',
                  outOfBounds && 'cursor-not-allowed !bg-transparent font-medium text-slate-300 hover:bg-transparent'
                )}
              >
                {fmtDay.format(new Date(y, m, d))}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const calendar = (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={!canNext}
          aria-label="الشهر التالي"
          className="grid size-9 place-items-center rounded-xl hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          <ChevronRight className="size-5 v2-flip-rtl" />
        </button>
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={!canPrev}
          aria-label="الشهر السابق"
          className="grid size-9 place-items-center rounded-xl hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-5 v2-flip-rtl" />
        </button>
      </div>
      <div className="mt-2">
        {renderMonth(view.y, view.m)}
      </div>
    </>
  );

  const trigger = (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-invalid={invalid || undefined}
      aria-label={label}
      className="v2-input flex h-12 min-h-0 w-full items-center gap-2 ps-11 text-start tabular-nums disabled:cursor-not-allowed disabled:opacity-55"
    >
      <CalendarDays className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
      <span className={cn('truncate text-[15px]', display ? 'font-semibold text-[#0B1B33]' : 'font-medium text-[#9AA8BD]')}>
        {display || placeholder || 'يوم/شهر/سنة'}
      </span>
    </button>
  );

  const wrapCls = 'relative block min-w-0';

  // ── Mobile: bottom sheet ──────────────────────────────────────
  if (isMobile) {
    return (
      <div dir={dir} className={wrapCls}>
        {trigger}
        {open && !disabled && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
            <div className="absolute inset-0 bg-[#0B1B33]/55" onClick={() => setOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-[0_-12px_48px_rgba(11,27,51,0.25)]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[14px] font-extrabold text-[#0B1B33]">{label}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="إغلاق"
                  className="grid size-9 place-items-center rounded-full bg-slate-100 text-[#0B1B33]"
                >
                  <X className="size-5" />
                </button>
              </div>
              {calendar}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Desktop: Radix popover ────────────────────────────────────
  return (
    <div dir={dir} className={wrapCls}>
      <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
        <Popover.Trigger asChild disabled={disabled}>{trigger}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="end"
            sideOffset={8}
            avoidCollisions
            collisionPadding={12}
            role="dialog"
            aria-label={label}
            className="z-50 w-[min(380px,calc(100vw-24px))] rounded-2xl border border-[#E6EBF2] bg-white p-4 shadow-[0_24px_64px_rgba(11,27,51,0.18)]"
          >
            {calendar}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
