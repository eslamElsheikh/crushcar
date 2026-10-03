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
import { TripForm, StopDraft } from '@/components/v2/TripForm';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [b, s, tripData] = await Promise.all([
          fetch('/api/buses', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/stations', { credentials: 'include' }).then((r) => r.json()),
          fetch(`/api/trips/${tripId}`, { credentials: 'include' }).then((r) => r.json()),
        ]);
        setBuses(Array.isArray(b) ? b : []);
        const allStations = s.stations || s || [];
        setStations(allStations);
        setBusId(tripData.busId || '');
        setDeparture(tripData.departure ? toLocal(tripData.departure) : '');
        setArrival(tripData.arrival ? toLocal(tripData.arrival) : '');
        setStatus(tripData.status || 'SCHEDULED');
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
        stops: stops.map((s) => ({
          stationId: s.stationId,
          stopOrder: s.stopOrder,
          priceFromOrigin: s.priceFromOrigin,
          arrivalTime: s.arrivalTime ? new Date(`${departure.split('T')[0]}T${s.arrivalTime}`).toISOString() : null,
          departureTime: s.departureTime ? new Date(`${departure.split('T')[0]}T${s.departureTime}`).toISOString() : null,
        })),
      };
      await fetch(`/api/trips/${tripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      router.push('/admin/trips');
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
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
          />
          <V2Button type="submit" size="lg" disabled={saving} className="mt-5 w-full sm:w-auto">
            {saving && <Loader2 className="size-5 animate-spin" />} {t('common.save')}
          </V2Button>
        </form>
      )}
    </div>
  );
}
