'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, MapPin, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { matchStation, splitHighlight } from '@/lib/search-ar';

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
  /** DOM id of the input (for validation focus). */
  id?: string;
  /** DOM id of the next field — focused automatically after pick. */
  nextId?: string;
  /** Hide this station id from the list (e.g. the other field's selection). */
  excludeId?: string;
  /** When set, shows a top "all/clear" row with this label. */
  emptyLabel?: string;
  /** Field-level validation state (red ring via .v2-input[aria-invalid]). */
  invalid?: boolean;
  className?: string;
}

interface Group {
  city: string;
  stations: PickerStation[];
}

function Highlight({ text, query }: { text: string; query: string }) {
  const parts = splitHighlight(text, query);
  if (!parts) return <>{text}</>;
  const [before, hit, after] = parts;
  return (
    <>
      {before}
      <mark className="rounded bg-[#1D5BD8]/15 text-inherit">{hit}</mark>
      {after}
    </>
  );
}

/**
 * Inline autocomplete: a text input with an attached overlay list right
 * below it (same width, flips above when room is tight). The overlay floats
 * above content so it never resizes the card or gets clipped by layout flow.
 */
export function StationPicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  id,
  nextId,
  excludeId,
  emptyLabel,
  invalid,
  className,
}: StationPickerProps) {
  const t = useLangStore((s) => s.t);
  const baseId = useId().replace(/:/g, '');
  const listId = `${baseId}-listbox`;

  const [stations, setStations] = useState<PickerStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  // Overlay placement: flip above the field when room below is tight.
  const [flip, setFlip] = useState(false);
  const [maxH, setMaxH] = useState(320);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Stations that actually have trips in the DB (server-filtered).
  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const r = await fetch('/api/stations?onlyWithTrips=1');
      const d = await r.json();
      const list: PickerStation[] = d.stations || [];
      setStations(Array.isArray(list) ? list : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const selected = stations.find((s) => s.id === value);

  // When closed, the input shows the selected station name; while open it
  // shows the live search query.
  const inputValue = open ? query : selected?.name ?? '';

  const groups: Group[] = useMemo(() => {
    const list = stations.filter((s) => {
      if (excludeId && s.id === excludeId) return false;
      return matchStation(s.name, s.city, query);
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

  // Flat visible options for keyboard nav (+ empty row first).
  const flatIds: string[] = useMemo(() => {
    const out: string[] = [];
    if (emptyLabel) out.push('');
    for (const g of groups) for (const s of g.stations) out.push(s.id);
    return out;
  }, [groups, emptyLabel]);

  const totalCount = groups.reduce((n, g) => n + g.stations.length, 0);

  function focusNext() {
    if (!nextId) return;
    requestAnimationFrame(() => document.getElementById(nextId)?.focus());
  }

  function pick(stationId: string) {
    onChange(stationId);
    setQuery('');
    setActiveId(null);
    setOpen(false);
    focusNext();
  }

  function clear() {
    onChange('');
    setQuery('');
    setActiveId(null);
    setOpen(false);
    inputRef.current?.focus();
  }

  function openList() {
    setOpen(true);
    setActiveId(null);
    if (stations.length === 0 && !loading) load();
  }

  // Measure room around the field; flip above it when space below is tight.
  function updatePlacement() {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const shouldFlip = spaceBelow < 240 && spaceAbove > spaceBelow;
    setFlip(shouldFlip);
    setMaxH(Math.max(200, Math.min(320, shouldFlip ? spaceAbove : spaceBelow)));
  }

  // Re-measure while open (scroll / resize / open).
  useEffect(() => {
    if (!open) return;
    updatePlacement();
    window.addEventListener('scroll', updatePlacement, true);
    window.addEventListener('resize', updatePlacement);
    return () => {
      window.removeEventListener('scroll', updatePlacement, true);
      window.removeEventListener('resize', updatePlacement);
    };
  }, [open ]);

  function moveActive(delta: 1 | -1) {
    if (flatIds.length === 0) return;
    setActiveId((cur) => {
      const i = cur !== null ? flatIds.indexOf(cur) : -1;
      const n = (i + delta + flatIds.length) % flatIds.length;
      return flatIds[n];
    });
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openList();
      else moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Enter') {
      if (open && activeId !== null && flatIds.includes(activeId)) {
        e.preventDefault();
        pick(activeId);
      }
    }
  }

  // Keep the active option visible (list-local scroll only).
  useEffect(() => {
    if (!open || activeId === null) return;
    const list = listRef.current;
    const opt = list?.querySelector(`[data-opt-id="${CSS.escape(activeId)}"]`) as HTMLElement | null;
    if (!list || !opt) return;
    const lr = list.getBoundingClientRect();
    const or = opt.getBoundingClientRect();
    if (or.top < lr.top) list.scrollTop -= lr.top - or.top;
    else if (or.bottom > lr.bottom) list.scrollTop += or.bottom - lr.bottom;
  }, [activeId, open ]);

  const optDomId = (optId: string) => `${baseId}-opt-${optId === '' ? 'empty' : optId}`;

  function renderEmptyRow() {
    if (!emptyLabel) return null;
    const isActive = activeId === '';
    return (
      <button
        key="__empty"
        type="button"
        role="option"
        id={optDomId('')}
        aria-selected={value === ''}
        data-opt-id=""
        onClick={() => pick('')}
        onMouseEnter={() => setActiveId('')}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl px-3.5 py-3 text-[14.5px] font-bold',
          value === ''
            ? 'bg-[#EFF4FF] text-[#1D5BD8]'
            : isActive
              ? 'bg-slate-100 text-[#0B1B33]'
              : 'text-[#0B1B33] hover:bg-slate-50'
        )}
      >
        {emptyLabel}
      </button>
    );
  }

  function renderGroup(g: Group) {
    // Governorate header always shows (even for a single station),
    // followed by that governorate's stations that have trips.
    return (
      <div key={g.city} role="group" aria-label={g.city}>
        <div className="flex items-center justify-between px-2 pb-1.5 pt-3 text-[13px]">
          <span className="flex items-center gap-1.5 font-bold text-[#5B6B84]">
            <Building2 className="size-4" />
            <Highlight text={g.city} query={query} />
          </span>
          <span className="font-semibold text-[#9AA8BD]">
            {t('v2.stationCount').replace('{n}', String(g.stations.length))}
          </span>
        </div>
        <div className="grid gap-1.5">
          {g.stations.map((s) => {
            const isSel = s.id === value;
            const isActive = activeId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                id={optDomId(s.id)}
                aria-selected={isSel}
                data-opt-id={s.id}
                onClick={() => pick(s.id)}
                onMouseEnter={() => setActiveId(s.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-[15px]',
                  isSel
                    ? 'border-[#1D5BD8] bg-[#1D5BD8] font-extrabold text-white'
                    : isActive
                      ? 'border-[#E6EBF2] bg-slate-100 font-bold text-[#0B1B33]'
                      : 'border-[#E6EBF2] bg-white font-bold text-[#0B1B33] hover:bg-slate-50'
                )}
              >
                <span className="min-w-0 truncate">
                  <Highlight text={s.name} query={query} />
                </span>
                <MapPin className={cn('size-4 shrink-0', isSel ? 'text-white/80' : 'text-[#9AA8BD]')} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      <span className="relative block">
        <MapPin className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
        <input
          ref={inputRef}
          id={id}
          value={inputValue}
          onChange={(e) => {
            const v = e.target.value;
            // Typing always searches; clearing the text clears the selection.
            if (!open) openList();
            setQuery(v);
            setActiveId(null);
            if (v === '' && value !== '') onChange('');
          }}
          onFocus={() => {
            // Focus shows the current value; reopen list with full stations.
            setQuery('');
            setActiveId(null);
            openList();
          }}
          onKeyDown={onInputKey}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId !== null ? optDomId(activeId) : undefined}
          aria-invalid={invalid || undefined}
          className="v2-input h-12 min-h-0 w-full pe-16 ps-11 text-[15px] font-semibold text-[#0B1B33] placeholder:font-medium placeholder:text-[#9AA8BD]"
        />
        {value ? (
          <button
            type="button"
            onClick={clear}
            aria-label={t('v2.close')}
            className="absolute end-10 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[#9AA8BD] hover:bg-slate-100 hover:text-[#0B1B33]"
          >
            <X className="size-4" />
          </button>
        ) : null}
        <span className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-[#9AA8BD]">
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </span>
      </span>

      {/* Attached overlay list: floats above content, never resizes the card. */}
      {open && (
        <div
          className={cn(
            'absolute inset-x-0 z-50 overflow-hidden rounded-2xl border border-[#E6EBF2] bg-white shadow-[0_24px_64px_rgba(11,27,51,0.18)]',
            flip ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          <div className="flex items-center gap-1.5 border-b border-[#E6EBF2] px-3.5 py-2.5 text-[13px]">
            <Search className="size-4 text-[#1D5BD8]" />
            <span className="font-bold text-[#5B6B84]">{t('v2.chooseGovStation')}</span>
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            style={{ maxHeight: maxH }}
            className="v2-thin-scroll overflow-y-auto p-2.5"
          >
            {loading ? (
              <p className="px-2 py-6 text-center text-[14px] font-semibold text-[#5B6B84]">
                {t('v2.stationsLoading')}
              </p>
            ) : failed ? (
              <div className="grid gap-2 px-2 py-6 text-center">
                <p className="text-[14px] font-semibold text-[#5B6B84]">{t('v2.stationsFailed')}</p>
                <button
                  type="button"
                  onClick={load}
                  className="mx-auto rounded-xl bg-[#EFF4FF] px-5 py-2.5 text-[13.5px] font-bold text-[#1D5BD8]"
                >
                  {t('v2.retry')}
                </button>
              </div>
            ) : (
              <>
                {renderEmptyRow()}
                {groups.map(renderGroup)}
                {totalCount === 0 && (
                  <p className="px-2 py-6 text-center text-[14px] font-semibold text-[#5B6B84]">
                    {t('v2.noStations')}
                  </p>
                )}
                {totalCount > 0 && (
                  <p className="px-2 pb-1 pt-3 text-center text-[12.5px] font-semibold text-[#9AA8BD]">
                    {t('v2.stationResults').replace('{n}', String(totalCount))}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
