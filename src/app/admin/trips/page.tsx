'use client';

import { routeLabel } from '@/lib/route-label';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Pencil, Armchair, Users, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Table, V2Pagination, V2Modal, V2Tabs } from '@/components/v2/admin';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge } from '@/components/v2/ui';
import { TripForm, StopDraft, TripBookingMode } from '@/components/v2/TripForm';
import { useTripStopsFromBus } from '@/hooks/useTripStopsFromBus';
import { busesForMode } from '@/lib/bus-types';

/* V2 admin trips — same list/filter/bulk-create/delete APIs as V1. */

interface Trip {
  id: string; origin: string; destination: string;
  departure: string; arrival: string; price: number; status: string;
  bookingMode?: string; busPrice?: number | null;
  bus?: { name: string };
}

type Filter = 'all' | 'upcoming' | 'completed' | 'cancelled';

const toneFor = (s: string) =>
  s === 'SCHEDULED' ? 'blue' : s === 'COMPLETED' ? 'green' : s === 'CANCELLED' ? 'red' : 'amber';

export default function AdminTrips() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed load must be visible: swallowing it silently is what turned a 500
  // into a confident-looking "no trips" empty state.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState({
    busId: '', fromStationId: '', toStationId: '',
    departureTime: '08:00', arrivalTime: '11:30', price: '',
    count: '7', interval: 'daily',
    bookingMode: 'SEAT' as TripBookingMode,
  });
  const EMPTY_BULK = {
    busId: '', fromStationId: '', toStationId: '',
    departureTime: '08:00', arrivalTime: '11:30', price: '',
    count: '7', interval: 'daily',
    bookingMode: 'SEAT' as TripBookingMode,
  };
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Trip type is an axis of its own, independent of status, so it is a select
  // next to the status tabs rather than another tab (otherwise "charter +
  // completed" would need its own tab).
  const [modeFilter, setModeFilter] = useState<TripBookingMode | 'ALL'>('ALL');

  const [newOpen, setNewOpen] = useState(false);
  const [trip, setTrip] = useState({
    busId: '', departure: '', arrival: '',
    bookingMode: 'SEAT' as TripBookingMode, busPrice: '',
  });
  const [tripStops, setTripStops] = useState<StopDraft[]>([]);
  const [savingTrip, setSavingTrip] = useState(false);

  const loadTrips = useCallback(async (pageNum: number, f: Filter, mode: TripBookingMode | 'ALL') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum), take: '20' });
      // The API only applies its "SCHEDULED + upcoming" default when no status is
      // sent. Pin every tab explicitly so the admin list shows past trips too.
      const STATUS_BY_FILTER: Record<Filter, string> = {
        all: 'ALL',
        upcoming: 'SCHEDULED',
        completed: 'COMPLETED',
        cancelled: 'CANCELLED',
      };
      params.set('status', STATUS_BY_FILTER[f]);
      params.set('bookingMode', mode);
      const res = await fetch(`/api/trips?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTrips(data.data || []);
        setPages(data.pagination?.pages || 1);
        setTotal(data.pagination?.total || 0);
        setLoadError(null);
      } else {
        setLoadError(`HTTP ${res.status}`);
      }
    } catch {
      setLoadError('network');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadTrips(1, 'all', 'ALL');
    fetch('/api/buses', { credentials: 'include' }).then((r) => r.json()).then((d) => setBuses(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/stations', { credentials: 'include' }).then((r) => r.json()).then((d) => setStations(Array.isArray(d.stations) ? d.stations : Array.isArray(d) ? d : [])).catch(() => {});
  }, [loadTrips]);

  useTripStopsFromBus(
    trip.busId,
    stations,
    trip.bookingMode,
    Number(trip.busPrice) || 0,
    setTripStops
  );

  // Charter trips can only be assigned from CHARTER buses, and vice versa.
  const bulkBuses = busesForMode(buses, bulk.bookingMode, bulk.busId);

  function changeModeFilter(mode: TripBookingMode | 'ALL') {
    setModeFilter(mode);
    setPage(1);
    loadTrips(1, filter, mode);
  }

  function closeNewTrip() {
    setNewOpen(false);
    setTrip({ busId: '', departure: '', arrival: '', bookingMode: 'SEAT', busPrice: '' });
    setTripStops([]);
  }

  async function submitTrip(e: React.FormEvent) {
    e.preventDefault();
    const isCharter = trip.bookingMode === 'BUS';
    if (tripStops.length < 2 || !trip.busId || !trip.departure || !trip.arrival) {
      toast.error(isRTL ? 'أكمل الباص والمواعيد ومحطتين على الأقل' : 'Pick a bus, times, and at least 2 stops');
      return;
    }
    if (isCharter && !(Number(trip.busPrice) > 0)) {
      toast.error(t('trips.charterPriceRequired'));
      return;
    }
    setSavingTrip(true);
    try {
      const first = tripStops[0];
      const last = tripStops[tripStops.length - 1];
      const day = trip.departure.split('T')[0];
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          busId: trip.busId,
          origin: first.name,
          destination: last.name,
          departure: trip.departure,
          arrival: trip.arrival,
          price: last.priceFromOrigin,
          bookingMode: trip.bookingMode,
          busPrice: isCharter ? Number(trip.busPrice) : null,
          stops: tripStops.map((s) => ({
            stationId: s.stationId,
            stopOrder: s.stopOrder,
            priceFromOrigin: s.priceFromOrigin,
            arrivalTime: s.arrivalTime ? new Date(`${day}T${s.arrivalTime}`).toISOString() : null,
            departureTime: s.departureTime ? new Date(`${day}T${s.departureTime}`).toISOString() : null,
          })),
        }),
      });
      if (res.ok) {
        toast.success(t('common.success'));
        closeNewTrip();
        loadTrips(1, filter, modeFilter);
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSavingTrip(false);
    }
  }

  function changeFilter(f: Filter) {
    setFilter(f);
    setPage(1);
    loadTrips(1, f, modeFilter);
  }
  function changePage(p: number) {
    setPage(p);
    loadTrips(p, filter, modeFilter);
  }

  async function bulkCreate() {
    const count = parseInt(bulk.count);
    const priceNum = Number(bulk.price);
    const fromStation = stations.find((s) => s.id === bulk.fromStationId);
    const toStation = stations.find((s) => s.id === bulk.toStationId);
    const isCharter = bulk.bookingMode === 'BUS';
    if (!bulk.busId || !fromStation || !toStation || !priceNum || !count) {
      toast.error(isRTL ? 'أكمل كل الحقول' : 'Fill all fields');
      return;
    }
    if (isCharter && !(priceNum > 0)) {
      toast.error(t('trips.charterPriceRequired'));
      return;
    }
    setCreating(true);
    let failed = 0;
    let firstError = '';
    try {
      const [dh, dm] = bulk.departureTime.split(':').map(Number);
      const [ah, am] = bulk.arrivalTime.split(':').map(Number);
      const base = new Date();
      for (let i = 0; i < count; i++) {
        const day = new Date(base);
        if (bulk.interval === 'weekly') day.setDate(day.getDate() + i * 7);
        else if (bulk.interval === 'weekdays') {
          let added = 0;
          let d = new Date(base);
          while (added < i + 1) {
            d.setDate(d.getDate() + 1);
            if (d.getDay() !== 0 && d.getDay() !== 6) added++;
          }
          day.setTime(d.getTime());
        } else {
          day.setDate(day.getDate() + i);
        }
        const dep = new Date(day); dep.setHours(dh, dm, 0, 0);
        const arr = new Date(day); arr.setHours(ah, am, 0, 0);
        // Each request is checked: a rejected POST used to fall through to a
        // success toast, so a run that created nothing still looked complete.
        const res = await fetch('/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            busId: bulk.busId,
            origin: fromStation.name,
            destination: toStation.name,
            departure: dep.toISOString(),
            arrival: arr.toISOString(),
            price: priceNum,
            bookingMode: bulk.bookingMode,
            busPrice: isCharter ? priceNum : null,
            stops: [
              // A charter trip carries the same total on every stop, matching
              // distributeCharterTotal in the single-trip form.
              { stationId: fromStation.id, stopOrder: 1, priceFromOrigin: isCharter ? priceNum : 0 },
              { stationId: toStation.id, stopOrder: 2, priceFromOrigin: priceNum },
            ],
          }),
        });
        if (!res.ok) {
          failed++;
          if (!firstError) firstError = (await res.json().catch(() => ({}))).error || res.statusText;
        }
      }
      const ok = count - failed;
      if (failed) {
        toast.error(t('trips.bulkPartial').replace('{ok}', String(ok)).replace('{failed}', String(failed)), {
          description: firstError,
        });
      } else {
        toast.success(t('trips.bulkCreated').replace('{n}', String(ok)));
        setBulkOpen(false);
        setBulk(EMPTY_BULK);
      }
      loadTrips(page, filter, modeFilter);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/trips/${id}`, { method: 'DELETE', credentials: 'include' });
      setTrips((prev) => prev.filter((x) => x.id !== id));
    } catch { /* keep row */ } finally { setDeleting(null); }
  }

  return (
    <div>
      <V2PageHeader
        title={t('nav.trips')}
        sub={isRTL ? `${total} رحلة` : `${total} trips`}
        action={
          <>
            <V2Button variant="ghost" onClick={() => setBulkOpen(true)}>
              <Zap className="size-5" /> {isRTL ? 'إنشاء متعدد' : 'Bulk create'}
            </V2Button>
            <V2Button variant="primary" onClick={() => setNewOpen(true)}>
              <Plus className="size-5" /> {t('trips.newTrip')}
            </V2Button>
          </>
        }
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <V2Tabs
          active={filter}
          onChange={changeFilter}
          tabs={[
            { key: 'all', label: isRTL ? 'الكل' : 'All' },
            { key: 'upcoming', label: isRTL ? 'القادمة' : 'Upcoming' },
            { key: 'completed', label: isRTL ? 'المكتملة' : 'Completed' },
            { key: 'cancelled', label: isRTL ? 'الملغاة' : 'Cancelled' },
          ]}
        />
        <V2Select
          value={modeFilter}
          onChange={(e) => changeModeFilter(e.target.value as TripBookingMode | 'ALL')}
          aria-label={t('trips.bookingMode')}
          className="!min-h-[44px] !w-auto text-[13.5px]"
        >
          <option value="ALL">{t('trips.allTrips')}</option>
          <option value="SEAT">{t('trips.seatTrips')}</option>
          <option value="BUS">{t('trips.charterTrips')}</option>
        </V2Select>
      </div>

      {loadError && !loading && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-600"
        >
          <span>
            {t('trips.loadFailed')}
            {loadError !== 'network' && (
              <span className="font-normal"> ({loadError})</span>
            )}
          </span>
          <V2Button variant="ghost" onClick={() => loadTrips(page, filter, modeFilter)}>
            {t('v2.retry')}
          </V2Button>
        </div>
      )}

      <div className="mt-4">
        <V2Table
          columns={[
            isRTL ? 'المسار' : 'Route',
            isRTL ? 'المغادرة' : 'Departure',
            isRTL ? 'الباص' : 'Bus',
            isRTL ? 'السعر' : 'Price',
            isRTL ? 'الحالة' : 'Status',
            isRTL ? 'النوع' : 'Type',
            '',
          ]}
          rows={trips}
          rowKey={(x) => x.id}
          loading={loading}
          emptyTitle={t('trips.noTrips')}
          renderCell={(tr, i) => {
            const cells = [
              <span key="r" className="font-bold">
                {routeLabel(tr.origin, tr.destination, isRTL)}
              </span>,
              <span key="d" className="tabular-nums text-[var(--sp-text-muted)]">
                {new Date(tr.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                {' · '}
                {new Date(tr.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
              </span>,
              <span key="b" className="text-[var(--sp-text-muted)]">{tr.bus?.name}</span>,
              <span key="p" className="font-extrabold tabular-nums">
                {tr.bookingMode === 'BUS'
                  ? Number(tr.busPrice ?? 0).toLocaleString(locale)
                  : tr.price.toLocaleString(locale)}{' '}
                {t('common.currency')}
              </span>,
              <V2StatusBadge key="s" tone={toneFor(tr.status) as 'blue' | 'green' | 'red' | 'amber'}>{t(tr.status) || tr.status}</V2StatusBadge>,
              tr.bookingMode === 'BUS' ? (
                <V2StatusBadge key="m" tone="amber">{t('trips.charterTrips')}</V2StatusBadge>
              ) : null,
              <span key="a" className="flex justify-end gap-1">
                <Link href={`/admin/trips/${tr.id}/edit`} aria-label="Edit" className="grid size-10 place-items-center rounded-xl text-[var(--sp-text-muted)] hover:bg-slate-100 hover:text-[#0B1B33]">
                  <Pencil className="size-5" />
                </Link>
                <Link href={`/admin/trips/${tr.id}/seats`} aria-label="Seats" className="grid size-10 place-items-center rounded-xl text-[var(--sp-text-muted)] hover:bg-slate-100 hover:text-[#0B1B33]">
                  <Armchair className="size-5" />
                </Link>
                <Link href={`/admin/trips/${tr.id}/passengers`} aria-label="Passengers" className="grid size-10 place-items-center rounded-xl text-[var(--sp-text-muted)] hover:bg-slate-100 hover:text-[#0B1B33]">
                  <Users className="size-5" />
                </Link>
                <button
                  onClick={() => remove(tr.id)} disabled={deleting === tr.id}
                  aria-label="Delete"
                  className="grid size-10 place-items-center rounded-xl text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting === tr.id ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
                </button>
              </span>,
            ];
            return cells[i];
          }}
          renderMobile={(tr) => (
            <div>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[15.5px] font-extrabold text-[#0B1B33]">
                  {routeLabel(tr.origin, tr.destination, isRTL)}
                </p>
                <V2StatusBadge tone={toneFor(tr.status) as 'blue' | 'green' | 'red' | 'amber'}>{t(tr.status) || tr.status}</V2StatusBadge>
              </div>
              <p className="mt-1.5 text-[13px] tabular-nums text-[var(--sp-text-muted)]">
                {new Date(tr.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })} ·{' '}
                {tr.bookingMode === 'BUS'
                  ? Number(tr.busPrice ?? 0).toLocaleString(locale)
                  : tr.price.toLocaleString(locale)}{' '}
                {t('common.currency')}
                {tr.bookingMode === 'BUS' && (
                  <span className="ms-1.5 font-bold text-amber-600">{t('trips.charterTrips')}</span>
                )}
              </p>
              <div className="mt-3 flex gap-1.5">
                <Link href={`/admin/trips/${tr.id}/edit`} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-center text-[13.5px] font-bold">{t('common.edit')}</Link>
                <Link href={`/admin/trips/${tr.id}/seats`} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-center text-[13.5px] font-bold">{t('nav.seats')}</Link>
                <button onClick={() => remove(tr.id)} disabled={deleting === tr.id} className="flex-1 rounded-xl bg-red-50 py-2.5 text-[13.5px] font-bold text-red-600 disabled:opacity-50">
                  {t('common.delete')}
                </button>
              </div>
            </div>
          )}
        />
        <V2Pagination page={page} pages={pages} onPage={(p) => { setPage(p); loadTrips(p, filter, modeFilter); }} />
      </div>

      <V2Modal open={newOpen} onClose={closeNewTrip} title={t('trips.newTrip')} wide>
        <form onSubmit={submitTrip}>
          <TripForm
            buses={buses}
            stations={stations}
            busId={trip.busId}
            setBusId={(v) => setTrip({ ...trip, busId: v })}
            departure={trip.departure}
            setDeparture={(v) => setTrip({ ...trip, departure: v })}
            arrival={trip.arrival}
            setArrival={(v) => setTrip({ ...trip, arrival: v })}
            status="SCHEDULED"
            setStatus={() => {}}
            stops={tripStops}
            setStops={setTripStops}
            bookingMode={trip.bookingMode}
            onBookingModeChange={(v) => setTrip({ ...trip, bookingMode: v })}
            busPrice={trip.busPrice}
            onBusPriceChange={(v) => setTrip({ ...trip, busPrice: v })}
          />
          <V2Button type="submit" size="lg" disabled={savingTrip} className="mt-5 w-full">
            {savingTrip && <Loader2 className="size-5 animate-spin" />} {t('trips.addTrip')}
          </V2Button>
        </form>
      </V2Modal>

      <V2Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={isRTL ? 'إنشاء رحلات متعددة' : 'Bulk create trips'} wide>
        {/* Same two tabs as the single-trip form, so bulk and single trips
            behave identically. */}
        <V2Tabs
          active={bulk.bookingMode}
          onChange={(m) => setBulk({ ...bulk, bookingMode: m })}
          tabs={[
            { key: 'SEAT' as const, label: t('trips.seatTab') },
            { key: 'BUS' as const, label: t('trips.charterTab') },
          ]}
        />
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <V2Field label={t('nav.buses')}>
            {bulkBuses.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 px-3.5 py-3 text-[13px] font-bold leading-relaxed text-[var(--sp-text-muted)]">
                {bulk.bookingMode === 'BUS' ? t('trips.noCharterBus') : t('trips.busesForSeatOnly')}
              </p>
            ) : (
              <V2Select value={bulk.busId} onChange={(e) => setBulk({ ...bulk, busId: e.target.value })}>
                <option value="">—</option>
                {bulkBuses.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </V2Select>
            )}
          </V2Field>
          {/* One price field serves both tabs; it is the per-seat price in a
              regular trip and the whole-bus total in a charter one. */}
          <V2Field label={bulk.bookingMode === 'BUS' ? t('trips.busPrice') : t('trips.price')}>
            <V2Input type="number" min="0" value={bulk.price} onChange={(e) => setBulk({ ...bulk, price: e.target.value })} dir="ltr" className="tabular-nums" />
          </V2Field>
          <V2Field label={t('v2.from')}>
            <V2Select value={bulk.fromStationId} onChange={(e) => setBulk({ ...bulk, fromStationId: e.target.value })}>
              <option value="">—</option>
              {stations.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </V2Select>
          </V2Field>
          <V2Field label={t('v2.to')}>
            <V2Select value={bulk.toStationId} onChange={(e) => setBulk({ ...bulk, toStationId: e.target.value })}>
              <option value="">—</option>
              {stations.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </V2Select>
          </V2Field>
          <V2Field label={isRTL ? 'وقت المغادرة' : 'Departure time'}>
            <V2Input type="time" value={bulk.departureTime} onChange={(e) => setBulk({ ...bulk, departureTime: e.target.value })} dir="ltr" className="tabular-nums" />
          </V2Field>
          <V2Field label={isRTL ? 'وقت الوصول' : 'Arrival time'}>
            <V2Input type="time" value={bulk.arrivalTime} onChange={(e) => setBulk({ ...bulk, arrivalTime: e.target.value })} dir="ltr" className="tabular-nums" />
          </V2Field>
          <V2Field label={isRTL ? 'العدد' : 'Count'}>
            <V2Input type="number" min="1" max="31" value={bulk.count} onChange={(e) => setBulk({ ...bulk, count: e.target.value })} dir="ltr" className="tabular-nums" />
          </V2Field>
          <V2Field label={isRTL ? 'التكرار' : 'Repeat'}>
            <V2Select value={bulk.interval} onChange={(e) => setBulk({ ...bulk, interval: e.target.value })}>
              <option value="daily">{isRTL ? 'يومي' : 'Daily'}</option>
              <option value="weekly">{isRTL ? 'أسبوعي' : 'Weekly'}</option>
              <option value="weekdays">{isRTL ? 'أيام العمل' : 'Weekdays'}</option>
            </V2Select>
          </V2Field>
        </div>
        <V2Button disabled={creating} onClick={bulkCreate} size="lg" className="mt-5 w-full">
          {creating && <Loader2 className="size-5 animate-spin" />} {t('common.confirm')}
        </V2Button>
      </V2Modal>
    </div>
  );
}
