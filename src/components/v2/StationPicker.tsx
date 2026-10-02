'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Building2, ChevronDown, MapPin, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { matchStation, splitHighlight } from '@/lib/search-ar';
import { useIsMobile } from './useMediaQuery';

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
  /** DOM id of the trigger (for validation focus). */
  id?: string;
  /** DOM id of the next field trigger — focused automatically after pick. */
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
  const lang = useLangStore((s) => s.lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const isMobile = useIsMobile();
  const baseId = useId().replace(/:/g, '');
  const listId = `${baseId}-listbox`;

  const [stations, setStations] = useState<PickerStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
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

  // Refetch on open when empty (a failed first load must not stick forever).
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery('');
      setActiveId(null);
      if (stations.length === 0 && !loading) load();
    }
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

  const selected = stations.find((s) => s.id === value);

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
    setOpen(false);
    focusNext();
  }

  function moveActive(delta: 1 | -1) {
    if (flatIds.length === 0) return;
    setActiveId((cur) => {
      const i = cur ? flatIds.indexOf(cur) : -1;
      const n = (i + delta + flatIds.length) % flatIds.length;
      return flatIds[n];
    });
  }

  function onSearchKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Enter' && activeId !== null && flatIds.includes(activeId)) {
      e.preventDefault();
      pick(activeId);
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
    const multi = g.stations.length > 1;
    return (
      <div key={g.city} role="group" aria-label={g.city}>
        {multi && (
          <div className="flex items-center justify-between px-2 pb-1.5 pt-3 text-[13px]">
            <span className="flex items-center gap-1.5 font-bold text-[#5B6B84]">
              <Building2 className="size-4" />
              <Highlight text={g.city} query={query} />
            </span>
            <span className="font-semibold text-[#9AA8BD]">
              {t('v2.stationCount').replace('{n}', String(g.stations.length))}
            </span>
          </div>
        )}
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
                  {!multi && s.city && s.city !== s.name && (
                    <span className={cn('font-semibold', isSel ? 'text-white/70' : 'text-[#9AA8BD]')}>
                      {' · '}
                      <Highlight text={s.city} query={query} />
                    </span>
                  )}
                </span>
                <MapPin className={cn('size-4 shrink-0', isSel ? 'text-white/80' : 'text-[#9AA8BD]')} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const listBody = (
    <>
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
    </>
  );

  const searchBox = (
    <div className="shrink-0 border-b border-[#E6EBF2] p-2.5">
      <span className="relative block">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-[#1D5BD8]" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveId(null);
          }}
          onKeyDown={onSearchKey}
          placeholder={t('v2.stationSearchPh')}
          aria-label={t('v2.stationSearchPh')}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId !== null ? optDomId(activeId) : undefined}
          autoComplete="off"
          className="w-full rounded-xl border border-[#1D5BD8] bg-white py-3 pe-4 ps-10 text-[14.5px] font-medium text-[#0B1B33] outline-none placeholder:text-[#9AA8BD]"
        />
      </span>
    </div>
  );

  const trigger = (
    <button
      id={id}
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-invalid={invalid || undefined}
      onClick={() => handleOpenChange(!open)}
      className={cn(
        'v2-input flex h-12 min-h-0 w-full items-center gap-2 text-start',
        !selected && 'text-[#9AA8BD]'
      )}
    >
      <MapPin className="size-5 shrink-0 text-[#9AA8BD]" />
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-inherit">
        {selected ? selected.name : placeholder}
      </span>
      <ChevronDown className={cn('size-4 shrink-0 text-[#9AA8BD] transition-transform', open && 'rotate-180')} />
    </button>
  );

  // ── Mobile: bottom sheet ──────────────────────────────────────
  if (isMobile) {
    return (
      <div dir={dir} className={className}>
        {trigger}
        {open && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={ariaLabel}>
            <div className="absolute inset-0 bg-[#0B1B33]/55" onClick={() => setOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-12px_48px_rgba(11,27,51,0.25)]">
              <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3">
                <span className="text-[14px] font-extrabold text-[#0B1B33]">{t('v2.chooseGovStation')}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('v2.close')}
                  className="grid size-9 place-items-center rounded-full bg-slate-100 text-[#0B1B33]"
                >
                  <X className="size-5" />
                </button>
              </div>
              {searchBox}
              <div ref={listRef} id={listId} role="listbox" className="v2-thin-scroll min-h-0 flex-1 overflow-y-auto p-3">
                {listBody}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Desktop: Radix popover ────────────────────────────────────
  return (
    <div dir={dir} className={className}>
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger asChild>{trigger}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="end"
            sideOffset={8}
            avoidCollisions
            collisionPadding={12}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              searchRef.current?.focus();
            }}
            className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-2xl border border-[#E6EBF2] bg-white shadow-[0_24px_64px_rgba(11,27,51,0.18)]"
          >
            {searchBox}
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              className="v2-thin-scroll max-h-[min(360px,60vh)] overflow-y-auto p-2.5"
            >
              {listBody}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
