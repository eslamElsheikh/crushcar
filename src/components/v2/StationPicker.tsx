'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, ChevronDown, MapPin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';

export interface PickerStation {
  id: string;
  name: string;
  city: string;
}

interface StationPickerProps {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Hide this station id from the list (e.g. the other field's selection). */
  excludeId?: string;
  /** When set, shows a top "all/clear" row with this label. */
  emptyLabel?: string;
  className?: string;
}

interface Group {
  city: string;
  stations: PickerStation[];
}

export function StationPicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  excludeId,
  emptyLabel,
  className,
}: StationPickerProps) {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const [stations, setStations] = useState<PickerStation[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  // Fixed panel coords (portal) — null until measured on open (client-only).
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Stations that actually have trips in the DB (server-filtered).
  useEffect(() => {
    fetch('/api/stations?onlyWithTrips=1')
      .then((r) => r.json())
      .then((d) => {
        const list: PickerStation[] = d.stations || [];
        if (Array.isArray(list)) setStations(list);
      })
      .catch(() => {});
  }, []);

  // Measure the button and position the fixed portal panel (with flip).
  function updatePos() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const flip = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxH = Math.max(200, Math.min(400, flip ? spaceAbove : spaceBelow));
    setPos({
      top: flip ? Math.max(gap, r.top - gap - maxH) : r.bottom + gap,
      left: Math.max(gap, Math.min(r.left, window.innerWidth - r.width - gap)),
      width: r.width,
      maxH,
    });
  }

  // Close on outside click / Escape. Panel lives in a portal, so check both refs.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
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

  // Position + keep positioned on scroll/resize while open.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open ]);

  // Focus search when opened.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(-1);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open ]);

  const selected = stations.find((s) => s.id === value);

  const groups: Group[] = useMemo(() => {
    const q = query.trim();
    const list = stations.filter((s) => {
      if (excludeId && s.id === excludeId) return false;
      if (!q) return true;
      return s.name.includes(q) || (s.city || '').includes(q);
    });
    const byCity = new Map<string, PickerStation[]>();
    for (const s of list) {
      const city = s.city || t('v2.otherCity');
      const arr = byCity.get(city);
      if (arr) arr.push(s);
      else byCity.set(city, [s]);
    }
    return [...byCity.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'ar'))
      .map(([city, arr]) => ({
        city,
        stations: arr.sort((a, b) => a.name.localeCompare(b.name, 'ar')),
      }));
  }, [stations, query, excludeId, t]);

  // Flat list of visible options for keyboard navigation (+ empty row).
  const flat: { id: string }[] = useMemo(() => {
    const out: { id: string }[] = [];
    if (emptyLabel) out.push({ id: '' });
    for (const g of groups) for (const s of g.stations) out.push({ id: s.id });
    return out;
  }, [groups, emptyLabel]);

  const totalCount = groups.reduce((n, g) => n + g.stations.length, 0);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % Math.max(flat.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (e.key === 'Enter' && activeIdx >= 0 && flat[activeIdx]) {
      e.preventDefault();
      pick(flat[activeIdx].id);
    }
  }

  // Keep the active row visible (list-local scroll only — never scrolls the page).
  useEffect(() => {
    if (!open || activeIdx < 0) return;
    const list = listRef.current;
    const opt = list?.querySelector(`[data-opt="${activeIdx}"]`) as HTMLElement | null;
    if (!list || !opt) return;
    const lr = list.getBoundingClientRect();
    const or = opt.getBoundingClientRect();
    if (or.top < lr.top) list.scrollTop -= lr.top - or.top;
    else if (or.bottom > lr.bottom) list.scrollTop += or.bottom - lr.bottom;
  }, [activeIdx, open ]);

  let optCursor = -1;
  const nextOpt = () => {
    optCursor += 1;
    return optCursor;
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'v2-input flex w-full items-center gap-2 text-start',
          !selected && 'text-[#9AA8BD]'
        )}
      >
        <MapPin className="size-5 shrink-0 text-[#9AA8BD]" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-inherit">
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-[#9AA8BD] transition-transform', open && 'rotate-180')} />
      </button>

      {/* Portal to body: immune to ancestor overflow clipping (e.g. hero section). */}
      {open && pos && createPortal(
        <div
          ref={panelRef}
          dir={dir}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 50 }}
          className="overflow-hidden rounded-2xl border border-[#E6EBF2] bg-white shadow-[0_24px_64px_rgba(11,27,51,0.18)]"
        >
          {/* Search */}
          <div className="border-b border-[#E6EBF2] p-2.5">
            <span className="relative block">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-[#1D5BD8]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIdx(-1); }}
                onKeyDown={onListKey}
                placeholder={t('v2.stationSearchPh')}
                aria-label={t('v2.stationSearchPh')}
                className="w-full rounded-xl border border-[#1D5BD8] bg-white py-3 pe-4 ps-10 text-[14.5px] font-medium text-[#0B1B33] outline-none placeholder:text-[#9AA8BD]"
              />
            </span>
          </div>

          {/* List */}
          <div ref={listRef} role="listbox" onKeyDown={onListKey} style={{ maxHeight: pos.maxH }} className="overflow-y-auto p-2.5">
            <div className="flex items-center justify-between px-2 pb-2 pt-1 text-[13px]">
              <span className="font-bold text-[#5B6B84]">{t('v2.chooseGovStation')}</span>
              <span className="font-bold text-[#0B1B33]">
                {t('v2.stationResults').replace('{n}', String(totalCount))}
              </span>
            </div>

            {emptyLabel && (
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                data-opt={nextOpt()}
                onClick={() => pick('')}
                onMouseEnter={() => setActiveIdx(0)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl px-3.5 py-3 text-[14.5px] font-bold',
                  value === ''
                    ? 'bg-[#EFF4FF] text-[#1D5BD8]'
                    : activeIdx === 0
                      ? 'bg-slate-100 text-[#0B1B33]'
                      : 'text-[#0B1B33] hover:bg-slate-50'
                )}
              >
                {emptyLabel}
              </button>
            )}

            {groups.map((g) => (
              <div key={g.city}>
                <div className="flex items-center justify-between px-2 pb-1.5 pt-3 text-[13px]">
                  <span className="flex items-center gap-1.5 font-bold text-[#5B6B84]">
                    <Building2 className="size-4" />
                    {g.city}
                  </span>
                  <span className="font-bold text-[#0B1B33]">
                    {t('v2.stationCount').replace('{n}', String(g.stations.length))}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {g.stations.map((s) => {
                    const idx = nextOpt();
                    const isSel = s.id === value;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        data-opt={idx}
                        onClick={() => pick(s.id)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-[15px]',
                          isSel
                            ? 'border-[#1D5BD8] bg-[#1D5BD8] font-extrabold text-white'
                            : activeIdx === idx
                              ? 'border-[#E6EBF2] bg-slate-100 font-bold text-[#0B1B33]'
                              : 'border-[#E6EBF2] bg-white font-bold text-[#0B1B33] hover:bg-slate-50'
                        )}
                      >
                        <span className="truncate">{s.name}</span>
                        <MapPin className={cn('size-4 shrink-0', isSel ? 'text-white/80' : 'text-[#9AA8BD]')} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {totalCount === 0 && (
              <p className="px-2 py-6 text-center text-[14px] font-semibold text-[#5B6B84]">
                {t('v2.noStations')}
              </p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
