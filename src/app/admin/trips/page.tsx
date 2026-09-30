'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Pencil, Armchair, Users, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Table, V2Pagination, V2Modal, V2Tabs } from '@/components/v2/admin';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge } from '@/components/v2/ui';

/* V2 admin trips — same list/filter/bulk-create/delete APIs as V1. */

interface Trip {
  id: string; origin: string; destination: string;
  departure: string; arrival: string; price: number; status: string;
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
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState({
    busId: '', fromStationId: '', toStationId: '',
    departureTime: '08:00', arrivalTime: '11:30', price: '', count: '7', interval: 'daily',
  });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadTrips = useCallback(async (pageNum: number, f: Filter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum), take: '20' });
      if (f === 'upcoming') params.set('status', 'SCHEDULED');
      else if (f === 'completed') params.set('status', 'COMPLETED');
      else if (f === 'cancelled') params.set('status', 'CANCELLED');
      const res = await fetch(`/api/trips?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTrips(data.data || []);
        setPages(data.pagination?.pages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch { /* keep list */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadTrips(1, 'all');
    fetch('/api/buses', { credentials: 'include' }).then((r) => r.json()).then((d) => setBuses(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/stations', { credentials: 'include' }).then((r) => r.json()).then((d) => setStations(Array.isArray(d.stations) ? d.stations : Array.isArray(d) ? d : [])).catch(() => {});
  }, [loadTrips]);

  function changeFilter(f: Filter) {
    setFilter(f);
    setPage(1);
    loadTrips(1, f);
  }
  function changePage(p: number) {
    setPage(p);
    loadTrips(p, filter);
  }

  async function bulkCreate() {
    const count = parseInt(bulk.count);
    const priceNum = Number(bulk.price);
    const fromStation = stations.find((s) => s.id === bulk.fromStationId);
    const toStation = stations.find((s) => s.id === bulk.toStationId);
    if (!bulk.busId || !fromStation || !toStation || !priceNum || !count) {
      toast.error(isRTL ? 'أكمل كل الحقول' : 'Fill all fields');
      return;
    }
    setCreating(true);
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
        await fetch('/api/trips', {
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
            stops: [
              { stationId: fromStation.id, stopOrder: 1, priceFromOrigin: 0 },
              { stationId: toStation.id, stopOrder: 2, priceFromOrigin: priceNum },
            ],
          }),
        });
      }
      setBulkOpen(false);
      setBulk({ busId: '', fromStationId: '', toStationId: '', departureTime: '08:00', arrivalTime: '11:30', price: '', count: '7', interval: 'daily' });
      loadTrips(page, filter);
      toast.success(t('common.success'));
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
            <Link href="/admin/trips/new" className="v2-btn-primary inline-flex items-center gap-2 px-5 py-3 text-[14.5px]">
              <Plus className="size-5" /> {isRTL ? 'رحلة جديدة' : 'New trip'}
            </Link>
          </>
        }
      />

      <div className="mt-5">
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
      </div>

      <div className="mt-4">
        <V2Table
          columns={[
            isRTL ? 'المسار' : 'Route',
            isRTL ? 'المغادرة' : 'Departure',
            isRTL ? 'الباص' : 'Bus',
            isRTL ? 'السعر' : 'Price',
            isRTL ? 'الحالة' : 'Status',
            '',
          ]}
          rows={trips}
          rowKey={(x) => x.id}
          loading={loading}
          emptyTitle={t('trips.noTrips')}
          renderCell={(tr, i) => {
            const cells = [
              <span key="r" className="font-bold">
                {isRTL ? `${tr.destination} ← ${tr.origin}` : `${tr.origin} → ${tr.destination}`}
              </span>,
              <span key="d" className="tabular-nums text-[#5B6B84]">
                {new Date(tr.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                {' · '}
                {new Date(tr.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
              </span>,
              <span key="b" className="text-[#5B6B84]">{tr.bus?.name}</span>,
              <span key="p" className="font-extrabold tabular-nums">EGP {tr.price.toLocaleString(locale)}</span>,
              <V2StatusBadge key="s" tone={toneFor(tr.status) as 'blue' | 'green' | 'red' | 'amber'}>{tr.status}</V2StatusBadge>,
              <span key="a" className="flex justify-end gap-1">
                <Link href={`/admin/trips/${tr.id}/edit`} aria-label="Edit" className="grid size-10 place-items-center rounded-xl text-[#5B6B84] hover:bg-slate-100 hover:text-[#0B1B33]">
                  <Pencil className="size-5" />
                </Link>
                <Link href={`/admin/trips/${tr.id}/seats`} aria-label="Seats" className="grid size-10 place-items-center rounded-xl text-[#5B6B84] hover:bg-slate-100 hover:text-[#0B1B33]">
                  <Armchair className="size-5" />
                </Link>
                <Link href={`/admin/trips/${tr.id}/passengers`} aria-label="Passengers" className="grid size-10 place-items-center rounded-xl text-[#5B6B84] hover:bg-slate-100 hover:text-[#0B1B33]">
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
                  {isRTL ? `${tr.destination} ← ${tr.origin}` : `${tr.origin} → ${tr.destination}`}
                </p>
                <V2StatusBadge tone={toneFor(tr.status) as 'blue' | 'green' | 'red' | 'amber'}>{tr.status}</V2StatusBadge>
              </div>
              <p className="mt-1.5 text-[13px] tabular-nums text-[#5B6B84]">
                {new Date(tr.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · EGP {tr.price.toLocaleString(locale)}
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
        <V2Pagination page={page} pages={pages} onPage={(p) => { setPage(p); loadTrips(p, filter); }} />
      </div>

      <V2Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={isRTL ? 'إنشاء رحلات متعددة' : 'Bulk create trips'} wide>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <V2Field label={t('nav.buses')}>
            <V2Select value={bulk.busId} onChange={(e) => setBulk({ ...bulk, busId: e.target.value })}>
              <option value="">—</option>
              {buses.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </V2Select>
          </V2Field>
          <V2Field label={t('trips.price')}>
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
