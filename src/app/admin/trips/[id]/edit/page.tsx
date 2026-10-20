'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader } from '@/components/v2/admin';
import { V2Button } from '@/components/v2/Button';
import { V2Skeleton } from '@/components/v2/ui';
import { TripForm, StopDraft, TripBookingMode } from '@/components/v2/TripForm';

/* V2 edit trip — same prefill + PUT as V1. */

function toLocal(d: string): string {
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
function toHM(d: string): string {
  return new Date(d).toTimeString().slice(0, 5);
}

export default function EditTripPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [buses, setBuses] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [busId, setBusId] = useState('');
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [status, setStatus] = useState('SCHEDULED');
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [bookingMode, setBookingMode] = useState<TripBookingMode>('SEAT');
  const [busPrice, setBusPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // How many seats each company may hold on this trip. An empty value means
  // no limit for that company.
  const [quotas, setQuotas] = useState<{ id: string; name: string; maxSeats: string }[]>([]);
  const [savingQuotas, setSavingQuotas] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [b, s, tripData, quotaData] = await Promise.all([
          fetch('/api/buses', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/stations', { credentials: 'include' }).then((r) => r.json()),
          fetch(`/api/trips/${tripId}`, { credentials: 'include' }).then((r) => r.json()),
          fetch(`/api/admin/trips/${tripId}/quotas`, { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        setBuses(Array.isArray(b) ? b : []);
        const allStations = s.stations || s || [];
        setStations(allStations);
        if (quotaData?.companies) {
          setQuotas(
            quotaData.companies.map((c: any) => ({
              id: c.id,
              name: c.name,
              maxSeats: c.maxSeats == null ? '' : String(c.maxSeats),
            })),
          );
        }
        setBusId(tripData.busId || '');
        setDeparture(tripData.departure ? toLocal(tripData.departure) : '');
        setArrival(tripData.arrival ? toLocal(tripData.arrival) : '');
        setStatus(tripData.status || 'SCHEDULED');
        setBookingMode(tripData.bookingMode === 'BUS' ? 'BUS' : 'SEAT');
        setBusPrice(tripData.busPrice != null ? String(tripData.busPrice) : '');
        const existing: StopDraft[] = [];
        if (tripData.tripStops && Array.isArray(tripData.tripStops) && tripData.tripStops.length > 0) {
          tripData.tripStops.forEach((ts: any) => {
            const station = allStations.find((x: any) => x.id === ts.stationId);
            existing.push({
              stationId: ts.stationId,
              name: station?.name || ts.station?.name || '',
              stopOrder: ts.stopOrder,
              priceFromOrigin: ts.priceFromOrigin,
              arrivalTime: ts.arrivalTime ? toHM(ts.arrivalTime) : '',
              departureTime: ts.departureTime ? toHM(ts.departureTime) : '',
            });
          });
        } else if (tripData.stopsJson && tripData.stopsJson !== '[]') {
          try {
            const parsed = JSON.parse(tripData.stopsJson);
            parsed.forEach((x: any, i: number) => {
              existing.push({
                stationId: x.stationId || `fallback-${i}`,
                name: x.name,
                stopOrder: x.stopOrder ?? i + 1,
                priceFromOrigin: x.priceFromOrigin ?? 0,
                arrivalTime: '',
                departureTime: '',
              });
            });
          } catch { /* ignore legacy json */ }
        }
        setStops(existing);
      } catch {
        toast.error(t('common.error'));
      } finally {
        setLoading(false);
      }
    })();
  }, [tripId, t]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stops.length < 2) return;
    setSaving(true);
    try {
      const body = {
        busId,
        departure: new Date(departure).toISOString(),
        arrival: new Date(arrival).toISOString(),
        status,
        bookingMode,
        busPrice: bookingMode === 'BUS' ? Number(busPrice) : null,
        stops: stops.map((s) => ({
          stationId: s.stationId,
          stopOrder: s.stopOrder,
          priceFromOrigin: s.priceFromOrigin,
          arrivalTime: s.arrivalTime ? new Date(`${departure.split('T')[0]}T${s.arrivalTime}`).toISOString() : null,
          departureTime: s.departureTime ? new Date(`${departure.split('T')[0]}T${s.departureTime}`).toISOString() : null,
        })),
      };
      const res = await fetch(`/api/trips/${tripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // e.g. the trip already has a confirmed charter, so it cannot become
        // a seat trip. Surface the server's reason instead of navigating away.
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t('common.error'));
        return;
      }
      router.push('/admin/trips');
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function saveQuotas() {
    setSavingQuotas(true);
    try {
      const res = await fetch(`/api/admin/trips/${tripId}/quotas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          quotas: quotas.map((q) => ({
            companyId: q.id,
            maxSeats: q.maxSeats === '' ? null : q.maxSeats,
          })),
        }),
      });
      if (res.ok) {
        toast.success(isRTL ? 'تم حفظ حصص الشركات' : 'Company quotas saved');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSavingQuotas(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/trips" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--sp-text-muted)] hover:text-[#0B1B33]">
        <ArrowRight className="size-4 rotate-180 v2-flip-rtl" /> {t('nav.trips')}
      </Link>
      <div className="mt-3">
        <V2PageHeader title={isRTL ? 'تعديل الرحلة' : 'Edit trip'} />
      </div>
      {loading ? (
        <div className="mt-5 grid gap-3" role="status">
          <V2Skeleton className="h-16 rounded-2xl" />
          <V2Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6">
          <TripForm
            buses={buses}
            stations={stations}
            busId={busId}
            setBusId={setBusId}
            departure={departure}
            setDeparture={setDeparture}
            arrival={arrival}
            setArrival={setArrival}
            status={status}
            setStatus={setStatus}
            stops={stops}
            setStops={setStops}
            showStatus
            bookingMode={bookingMode}
            onBookingModeChange={setBookingMode}
            busPrice={busPrice}
            onBusPriceChange={setBusPrice}
          />
          <V2Button type="submit" size="lg" disabled={saving} className="mt-5 w-full sm:w-auto">
            {saving && <Loader2 className="size-5 animate-spin" />} {t('common.save')}
          </V2Button>
        </form>
      )}

      {/* How many seats each company may hold on this trip. Empty means no
          limit for that company. */}
      <div className="mt-5 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6">
        <h2 className="text-[16px] font-extrabold text-[#0B1B33]">
          {isRTL ? 'حصة كل شركة على هذه الرحلة' : 'Company quota for this trip'}
        </h2>
        <p className="mt-1 text-[13px] text-[var(--sp-text-muted)]">
          {isRTL
            ? 'اترك الحقل فارغاً لعدم وضع حد. العدد المحجوز حالياً محسوب من الحجوزات نفسها.'
            : 'Leave a field empty for no limit. The seats already held are counted from the bookings themselves.'}
        </p>
        {quotas.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--sp-text-muted)]">
            {isRTL ? 'لا توجد شركات مسجلة.' : 'No companies registered.'}
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {quotas.map((q, i) => (
              <div key={q.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#0B1B33]">{q.name}</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={q.maxSeats}
                  onChange={(e) => {
                    const next = [...quotas];
                    next[i] = { ...q, maxSeats: e.target.value };
                    setQuotas(next);
                  }}
                  placeholder={isRTL ? 'بلا حد' : 'No limit'}
                  dir="ltr"
                  className="w-28 rounded-xl border border-[var(--sp-line)] bg-[var(--sp-inset)] px-3 py-2 text-[14px] font-bold tabular-nums text-[#0B1B33] focus:outline-none focus:border-[#1D5BD8]"
                />
              </div>
            ))}
            <V2Button type="button" onClick={saveQuotas} disabled={savingQuotas} className="mt-1 w-full sm:w-auto">
              {savingQuotas && <Loader2 className="size-5 animate-spin" />}
              {isRTL ? 'حفظ الحصص' : 'Save quotas'}
            </V2Button>
          </div>
        )}
      </div>
    </div>
  );
}
