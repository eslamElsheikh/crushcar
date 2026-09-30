'use client';

import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
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
}) {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const available = stations.filter((s) => !stops.find((st) => st.stationId === s.id));

  function addStop(stationId: string) {
    const st = stations.find((s) => s.id === stationId);
    if (!st) return;
    setStops([
      ...stops,
      {
        stationId: st.id,
        name: st.name,
        stopOrder: stops.length + 1,
        priceFromOrigin: stops.length > 0 ? stops[stops.length - 1].priceFromOrigin + 50 : 0,
        arrivalTime: '',
        departureTime: '',
      },
    ]);
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

      <div className="rounded-2xl border border-[#E6EBF2] bg-white p-5">
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
            <div key={s.stationId} className="rounded-xl bg-[#F6F8FC] p-3.5">
              <div className="flex items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#0A1E3C] text-[12px] font-bold tabular-nums text-white">
                  {s.stopOrder}
                </span>
                <p className="min-w-0 flex-1 truncate text-[14.5px] font-extrabold text-[#0B1B33]">{s.name}</p>
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="grid size-9 place-items-center rounded-lg text-[#5B6B84] hover:bg-white disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label="Move down" className="grid size-9 place-items-center rounded-lg text-[#5B6B84] hover:bg-white disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
                <button
                  onClick={() => setStops(stops.filter((_, x) => x !== i).map((x, xi) => ({ ...x, stopOrder: xi + 1 })))}
                  aria-label="Remove stop"
                  className="grid size-9 place-items-center rounded-lg text-red-500 hover:bg-white"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                <label className="grid gap-1">
                  <span className="text-[11.5px] font-bold text-[#5B6B84]">EGP</span>
                  <input
                    type="number" min="0" value={s.priceFromOrigin}
                    onChange={(e) => update(i, 'priceFromOrigin', Number(e.target.value))}
                    dir="ltr"
                    className="v2-input tabular-nums !min-h-[44px] text-[13.5px]"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11.5px] font-bold text-[#5B6B84]">{isRTL ? 'وصول' : 'Arr'}</span>
                  <input
                    type="time" value={s.arrivalTime}
                    onChange={(e) => update(i, 'arrivalTime', e.target.value)}
                    dir="ltr"
                    className="v2-input tabular-nums !min-h-[44px] text-[13.5px]"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11.5px] font-bold text-[#5B6B84]">{isRTL ? 'مغادرة' : 'Dep'}</span>
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
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-4 text-[14px] font-bold text-[#5B6B84] hover:border-[#1D5BD8]/50 hover:text-[#1D5BD8]"
            >
              <Plus className="size-5" /> {isRTL ? 'إضافة أول محطة' : 'Add first stop'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
