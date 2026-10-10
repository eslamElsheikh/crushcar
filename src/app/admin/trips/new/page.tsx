'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader } from '@/components/v2/admin';
import { V2Button } from '@/components/v2/Button';
import { TripForm, StopDraft, TripBookingMode } from '@/components/v2/TripForm';
import { useTripStopsFromBus } from '@/hooks/useTripStopsFromBus';

/* V2 new trip — same auto-populate + POST as V1. */

export default function NewTripPage() {
  const router = useRouter();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [buses, setBuses] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [busId, setBusId] = useState('');
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [bookingMode, setBookingMode] = useState<TripBookingMode>('SEAT');
  const [busPrice, setBusPrice] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/buses', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/stations', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([b, s]) => {
      setBuses(Array.isArray(b) ? b : []);
      setStations(s.stations || s || []);
    }).catch(() => {});
  }, []);

  // Auto-populate stops from the bus's station list (shared with the
  // new-trip modal on /admin/trips).
  useTripStopsFromBus(busId, stations, bookingMode, Number(busPrice) || 0, setStops);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stops.length < 2 || !busId || !departure || !arrival) {
      toast.error(isRTL ? 'أكمل الباص والمواعيد ومحطتين على الأقل' : 'Pick a bus, times, and at least 2 stops');
      return;
    }
    if (bookingMode === 'BUS' && !(Number(busPrice) > 0)) {
      toast.error(t('trips.charterPriceRequired'));
      return;
    }
    setSaving(true);
    try {
      const first = stops[0];
      const last = stops[stops.length - 1];
      const body = {
        busId,
        origin: first.name,
        destination: last.name,
        departure,
        arrival,
        price: last.priceFromOrigin,
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
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (res.ok) router.push('/admin/trips');
      else toast.error((await res.json()).error || t('common.error'));
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
        <V2PageHeader title={t('trips.addTrip')} sub={t('trips.manage')} />
      </div>
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
          status="SCHEDULED"
          setStatus={() => {}}
          stops={stops}
          setStops={setStops}
          bookingMode={bookingMode}
          onBookingModeChange={setBookingMode}
          busPrice={busPrice}
          onBusPriceChange={setBusPrice}
        />
        <V2Button type="submit" size="lg" disabled={saving} className="mt-5 w-full sm:w-auto">
          {saving && <Loader2 className="size-5 animate-spin" />} {t('trips.addTrip')}
        </V2Button>
      </form>
    </div>
  );
}
