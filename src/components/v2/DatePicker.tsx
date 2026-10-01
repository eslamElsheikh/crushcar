'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const AR_DAYS = ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح']; // Sat..Fri (ar-EG week starts Saturday)

const fmtDay = new Intl.DateTimeFormat('ar-EG', { day: '2-digit' });
const fmtMonthYear = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' });

function toISO(y: number, m: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(m + 1)}-${p(d)}`;
}

/** Arabic date picker: dd/mm/yyyy order, Arabic month/day names, native value stays yyyy-mm-dd. */
export function V2DatePicker({
  value,
  onChange,
  min,
  label,
  placeholder,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  label: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [view, setView] = useState(() => {
    const v = value ? new Date(value + 'T12:00:00') : now;
    return isNaN(v.getTime()) ? { y: now.getFullYear(), m: now.getMonth() } : { y: v.getFullYear(), m: v.getMonth() };
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const display = value
    ? (() => {
        const [y, m, d] = value.split('-').map(Number);
        return `${fmtDay.format(new Date(y, m - 1, d))}/${String(m).padStart(2, '0')}/${y}`;
      })()
    : '';

  const firstDow = new Date(view.y, view.m, 1).getDay(); // 0=Sun..6=Sat
  const offset = (firstDow + 1) % 7; // ar-EG week starts Saturday
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());

  function shift(dir: -1 | 1) {
    setView((v) => {
      const m = v.m + dir;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="v2-input flex items-center gap-2 ps-11 text-start tabular-nums"
      >
        <CalendarDays className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
        <span className={cn('truncate', !display && 'text-[#9AA8BD]')}>
          {display || placeholder || 'يوم/شهر/سنة'}
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          aria-modal="false"
          className="absolute start-0 top-full z-40 mt-2 w-[320px] max-w-[calc(100vw-40px)] rounded-2xl border border-[#E6EBF2] bg-white p-4 shadow-[0_24px_64px_rgba(11,27,51,0.18)]"
        >
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => shift(1)} aria-label="الشهر التالي" className="grid size-9 place-items-center rounded-xl hover:bg-slate-100">
              <ChevronRight className="size-5 v2-flip-rtl" />
            </button>
            <p className="text-[15px] font-extrabold text-[#0B1B33]">
              {fmtMonthYear.format(new Date(view.y, view.m, 1))}
            </p>
            <button type="button" onClick={() => shift(-1)} aria-label="الشهر السابق" className="grid size-9 place-items-center rounded-xl hover:bg-slate-100">
              <ChevronLeft className="size-5 v2-flip-rtl" />
            </button>
          </div>
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
              const iso = toISO(view.y, view.m, d);
              const disabled = !!min && iso < min;
              const selected = iso === value;
              const isToday = iso === todayISO;
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  disabled={disabled}
                  aria-selected={selected}
                  aria-label={new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full' }).format(new Date(view.y, view.m, d))}
                  onClick={() => { onChange(iso); setOpen(false); }}
                  className={cn(
                    'grid size-10 place-items-center rounded-xl text-[14px] tabular-nums transition',
                    selected
                      ? 'bg-[#1D5BD8] font-extrabold text-white'
                      : 'font-semibold text-[#0B1B33] hover:bg-[#EFF4FF]',
                    isToday && !selected && 'ring-2 ring-[#1D5BD8]/40',
                    disabled && 'cursor-not-allowed text-slate-300 hover:bg-transparent'
                  )}
                >
                  {fmtDay.format(new Date(view.y, view.m, d))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
