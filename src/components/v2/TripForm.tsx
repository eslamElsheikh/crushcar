'use client';

import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { cn } from '@/lib/utils';
import { V2Field, V2Select, V2Input } from './Field';

/* Shared trip create/edit form (stops editor). POST/PUT stays in the pages. */

export interface StopDraft {
  stationId: string;
  name: string;
  stopOrder: number;
  priceFromOrigin: number;
  arrivalTime: string;
  departureTime: string;
}

export function normalizeName(s: string): string {
  return (s || '').trim().toLowerCase();
}

export type TripBookingMode = 'SEAT' | 'BUS';

/**
 * A charter trip is priced as one total for the whole bus, not split per stop.
 * Every stop therefore carries that same total.
 *
 * The last stop is what Trip.price is read from, and CharterBooking charges
 * busPrice with trip.price as the fallback, so this keeps both readings equal
 * to what the admin entered. Seats cannot be booked on a charter trip, so the
 * per-stop difference that seat pricing relies on is never computed from these.
 */
export function distributeCharterTotal(total: number, stopCount: number): number[] {
  return Array.from({ length: Math.max(0, stopCount) }, () => total);
}

export function TripForm({
  buses,
  stations,
  busId,
  setBusId,
  departure,
  setDeparture,
  arrival,
  setArrival,
  status,
  setStatus,
  stops,
  setStops,
  showStatus,
  bookingMode = 'SEAT',
  onBookingModeChange,
  busPrice = '',
  onBusPriceChange,
}: {
  buses: any[];
  stations: { id: string; name: string; city: string }[];
  busId: string;
  setBusId: (v: string) => void;
  departure: string;
  setDeparture: (v: string) => void;
  arrival: string;
  setArrival: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  stops: StopDraft[];
  setStops: (s: StopDraft[]) => void;
  showStatus?: boolean;
  bookingMode?: TripBookingMode;
  /** Required, not optional: an optional callback let the trip-type control
   *  disappear silently if a caller forgot it, which is exactly how the
   *  charter option became impossible to find. */
  onBookingModeChange: (v: TripBookingMode) => void;
  busPrice?: string;
  onBusPriceChange?: (v: string) => void;
}) {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const available = stations.filter((s) => !stops.find((st) => st.stationId === s.id));

  function addStop(stationId: string) {
    const st = stations.find((s) => s.id === stationId);
    if (!st) return;
    const next: StopDraft = {
      stationId: st.id,
      name: st.name,
      stopOrder: stops.length + 1,
      priceFromOrigin: stops.length > 0 ? stops[stops.length - 1].priceFromOrigin + 50 : 0,
      arrivalTime: '',
      departureTime: '',
    };
    if (bookingMode === 'BUS') {
      // Charter: every stop gets an equal slice of the single total.
      const total = Number(busPrice) || 0;
      const spread = distributeCharterTotal(total, stops.length + 1);
      next.priceFromOrigin = spread[stops.length];
    }
    setStops([...stops, next]);
  }

  // Re-apply the charter total whenever it changes or a stop is added/removed.
  function resyncCharterPrices(nextStops: StopDraft[], total: number) {
    const spread = distributeCharterTotal(total, nextStops.length);
    return nextStops.map((s, i) => ({ ...s, priceFromOrigin: spread[i] ?? 0 }));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= stops.length) return;
    const next = [...stops];
    [next[index], next[target]] = [next[target], next[index]];
    setStops(next.map((s, i) => ({ ...s, stopOrder: i + 1 })));
  }

  function update(index: number, field: keyof StopDraft, value: string | number) {
    const next = [...stops];
    (next[index] as any)[field] = value;
    setStops(next);
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <V2Field label={t('trips.bus')}>
          <V2Select value={busId} onChange={(e) => setBusId(e.target.value)}>
            <option value="">—</option>
            {buses.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </V2Select>
        </V2Field>
        {showStatus && (
          <V2Field label={t('trips.status')}>
            <V2Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="SCHEDULED">{t('status.scheduled')}</option>
              <option value="IN_PROGRESS">{t('status.inProgress')}</option>
              <option value="COMPLETED">{t('status.completed')}</option>
              <option value="CANCELLED">{t('status.cancelled')}</option>
            </V2Select>
          </V2Field>
        )}
        <V2Field label={t('trips.departure')}>
          <V2Input type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)} dir="ltr" className="tabular-nums" />
        </V2Field>
        <V2Field label={t('trips.arrival')}>
          <V2Input type="datetime-local" value={arrival} onChange={(e) => setArrival(e.target.value)} dir="ltr" className="tabular-nums" />
        </V2Field>
      </div>

      <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5">
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              {/* Segmented toggle rather than a native <select>: a collapsed
                  select shows only its selected value, so the charter option was
                  invisible until the field was clicked. Both types now stay on
                  screen at all times. */}
              <span className="text-[12.5px] font-bold text-[var(--sp-text-muted)]">
                {t('trips.bookingMode')}
              </span>
              <div role="group" aria-label={t('trips.bookingMode')} className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[var(--sp-inset)] p-1.5">
                {([
                  { value: 'SEAT' as const, label: t('trips.seatMode') },
                  { value: 'BUS' as const, label: t('trips.charterMode') },
                ]).map((opt) => {
                  const active = bookingMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        if (bookingMode === opt.value) return;
                        onBookingModeChange(opt.value);
                        if (opt.value === 'BUS') {
                          const total = Number(busPrice) || stops[stops.length - 1]?.priceFromOrigin || 0;
                          onBusPriceChange?.(String(total));
                          setStops(resyncCharterPrices(stops, total));
                        }
                      }}
                      aria-pressed={active}
                      className={cn(
                        'rounded-xl px-3 py-2.5 text-[13px] font-bold transition',
                        active
                          ? 'bg-[var(--sp-card)] text-[#0B1B33] shadow-[0_1px_3px_rgba(11,27,51,0.14)]'
                          : 'text-[var(--sp-text-muted)] hover:text-[#0B1B33]'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {bookingMode === 'BUS' && (
              <V2Field label={t('trips.busPrice')}>
                <V2Input
                  type="number"
                  min="0"
                  value={busPrice}
                  onChange={(e) => {
                    onBusPriceChange?.(e.target.value);
                    setStops(resyncCharterPrices(stops, Number(e.target.value) || 0));
                  }}
                  dir="ltr"
                  className="tabular-nums"
                />
              </V2Field>
            )}
          </div>

          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--sp-text-muted)]">
          {bookingMode === 'BUS' ? t('trips.charterHint') : t('trips.seatPriceHint')}
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-extrabold text-[#0B1B33]">
            {isRTL ? 'المحطات' : 'Stops'} · <span className="tabular-nums">{stops.length}</span>
          </p>
          <V2Select
            value=""
            onChange={(e) => { if (e.target.value) addStop(e.target.value); }}
            aria-label={isRTL ? 'إضافة محطة' : 'Add stop'}
            className="!min-h-[44px] !w-auto text-[13.5px]"
          >
            <option value="">+ {isRTL ? 'إضافة محطة' : 'Add stop'}</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>
            ))}
          </V2Select>
        </div>

        <div className="mt-4 grid gap-2.5">
          {stops.map((s, i) => (
            <div key={s.stationId} className="rounded-xl bg-[var(--sp-inset)] p-3.5">
              <div className="flex items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#0A1E3C] text-[12px] font-bold tabular-nums text-white">
                  {s.stopOrder}
                </span>
                <p className="min-w-0 flex-1 truncate text-[14.5px] font-extrabold text-[#0B1B33]">{s.name}</p>
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="grid size-9 place-items-center rounded-lg text-[var(--sp-text-muted)] hover:bg-[var(--sp-inset)] disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label="Move down" className="grid size-9 place-items-center rounded-lg text-[var(--sp-text-muted)] hover:bg-[var(--sp-inset)] disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
                <button
                  onClick={() => {
                    const remaining = stops.filter((_, x) => x !== i).map((x, xi) => ({ ...x, stopOrder: xi + 1 }));
                    setStops(bookingMode === 'BUS' ? resyncCharterPrices(remaining, Number(busPrice) || 0) : remaining);
                  }}
                  aria-label="Remove stop"
                  className="grid size-9 place-items-center rounded-lg text-red-500 hover:bg-[var(--sp-inset)]"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                <label className="grid gap-1">
                  <span className="text-[11.5px] font-bold text-[var(--sp-text-muted)]">EGP</span>
                  <input
                    type="number" min="0" value={s.priceFromOrigin}
                    onChange={(e) => update(i, 'priceFromOrigin', Number(e.target.value))}
                    readOnly={bookingMode === 'BUS'}
                    dir="ltr"
                    className="v2-input tabular-nums !min-h-[44px] text-[13.5px]"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11.5px] font-bold text-[var(--sp-text-muted)]">{isRTL ? 'وصول' : 'Arr'}</span>
                  <input
                    type="time" value={s.arrivalTime}
                    onChange={(e) => update(i, 'arrivalTime', e.target.value)}
                    dir="ltr"
                    className="v2-input tabular-nums !min-h-[44px] text-[13.5px]"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11.5px] font-bold text-[var(--sp-text-muted)]">{isRTL ? 'مغادرة' : 'Dep'}</span>
                  <input
                    type="time" value={s.departureTime}
                    onChange={(e) => update(i, 'departureTime', e.target.value)}
                    dir="ltr"
                    className="v2-input tabular-nums !min-h-[44px] text-[13.5px]"
                  />
                </label>
              </div>
            </div>
          ))}
          {stops.length === 0 && (
            <button
              onClick={() => available[0] && addStop(available[0].id)}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-4 text-[14px] font-bold text-[var(--sp-text-muted)] hover:border-[#1D5BD8]/50 hover:text-[#1D5BD8]"
            >
              <Plus className="size-5" /> {isRTL ? 'إضافة أول محطة' : 'Add first stop'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
