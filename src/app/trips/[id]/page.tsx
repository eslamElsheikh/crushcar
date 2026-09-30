'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  ArrowRight, Clock, MapPin, Bus, Check, CheckCircle2, Loader2,
  User, Phone, Building2, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2Button } from '@/components/v2/Button';
import { V2Field, V2Input, V2Select } from '@/components/v2/Field';
import { V2StatusBadge, V2Skeleton } from '@/components/v2/ui';
import {
  V2Trip, unavailableForSegment, segmentPrice, V2SeatMap,
} from '@/components/v2/booking';

/* V2 trip flow: details → seats → passengers → review, step carried in ?step=.
   Same APIs, same pricing math, same booking endpoints as V1. */

type Step = 'details' | 'seats' | 'passengers' | 'review';
const STEPS: Step[] = ['details', 'seats', 'passengers', 'review'];

function fmtDate(d: string, lang: string): string {
  return new Date(d).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}
function fmtTime(d: string, lang: string): string {
  return new Date(d).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    hour: '2-digit', minute: '2-digit',
  });
}
function durationOf(dep: string, arr: string, lang: string): string {
  const ms = new Date(arr).getTime() - new Date(dep).getTime();
  if (isNaN(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return lang === 'ar' ? `${h} س ${m} د` : `${h}h ${m}m`;
}

function TripContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tripId = params.id as string;
  const { data: session } = useSession();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const isCompany = session?.user?.role === 'COMPANY_ADMIN';

  const step: Step = (['details', 'seats', 'passengers', 'review'] as Step[]).includes(searchParams.get('step') as Step)
    ? (searchParams.get('step') as Step)
    : 'details';
  const returnTripId = searchParams.get('returnTripId');

  const [trip, setTrip] = useState<V2Trip | null>(null);
  const [returnTrip, setReturnTrip] = useState<V2Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const [fromStationId, setFromStationId] = useState<string | null>(searchParams.get('fromStationId'));
  const [toStationId, setToStationId] = useState<string | null>(searchParams.get('toStationId'));
  const [stopsOpen, setStopsOpen] = useState(false);

  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [returnSelectedSeats, setReturnSelectedSeats] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [hotels, setHotels] = useState<Record<string, string>>({});
  const [rNames, setRNames] = useState<Record<string, string>>({});
  const [rPhones, setRPhones] = useState<Record<string, string>>({});
  const [rHotels, setRHotels] = useState<Record<string, string>>({});

  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState<any[]>([]);

  const loadTrip = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}`);
      if (!res.ok) { setMissing(true); return; }
      setTrip(await res.json());
    } catch { setMissing(true); } finally { setLoading(false); }
  }, [tripId]);

  const loadReturn = useCallback(async () => {
    if (!returnTripId) return;
    try {
      const res = await fetch(`/api/trips/${returnTripId}`);
      if (res.ok) setReturnTrip(await res.json());
    } catch { /* keep going without return leg */ }
  }, [returnTripId]);

  useEffect(() => { loadTrip(); loadReturn(); }, [loadTrip, loadReturn]);

  useEffect(() => {
    const iv = setInterval(loadTrip, 5000);
    return () => clearInterval(iv);
  }, [loadTrip]);

  // Auto-select stops for direct / 2-stop trips; ask when intermediate stops exist
  useEffect(() => {
    if (!trip) return;
    const stops = trip.tripStops || [];
    if (stops.length <= 2) {
      if (!fromStationId) setFromStationId(stops[0]?.stationId || null);
      if (!toStationId) setToStationId(stops[stops.length - 1]?.stationId || null);
      setStopsOpen(false);
    } else if (!searchParams.get('fromStationId') || !searchParams.get('toStationId')) {
      setStopsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  const reserved = useMemo(
    () => unavailableForSegment(trip, fromStationId, toStationId), [trip, fromStationId, toStationId]
  );
  const returnReserved = useMemo(
    () => unavailableForSegment(returnTrip, searchParams.get('returnFromStationId'), searchParams.get('returnToStationId')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [returnTrip]
  );

  // Evict seats taken by others (same realtime guard as V1)
  useEffect(() => {
    if (!trip) return;
    const gone = selectedSeats.filter((s) => reserved.has(s));
    if (gone.length > 0) {
      setSelectedSeats((prev) => prev.filter((s) => !reserved.has(s)));
      toast.error(`${t('seat.reserved')} ${gone[0]}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  const seg = segmentPrice(trip, fromStationId, toStationId);
  const seatPriceOf = (label: string) =>
    seg + (trip?.bus?.layout?.seats.find((s) => s.label === label)?.price || 0);
  const total = selectedSeats.reduce((s, l) => s + seatPriceOf(l), 0);
  const returnTotal = returnSelectedSeats.reduce(
    (s, l) => s + (returnTrip?.price || 0) + (returnTrip?.bus?.layout?.seats.find((x) => x.label === l)?.price || 0), 0
  );

  function go(next: Step) {
    const q = new URLSearchParams(searchParams.toString());
    q.set('step', next);
    if (fromStationId) q.set('fromStationId', fromStationId);
    if (toStationId) q.set('toStationId', toStationId);
    router.replace(`/trips/${tripId}?${q.toString()}`, { scroll: false });
  }

  function toggle(label: string) {
    if (reserved.has(label)) return;
    setSelectedSeats((p) => (p.includes(label) ? p.filter((s) => s !== label) : [...p, label]));
  }
  function toggleReturn(label: string) {
    if (returnReserved.has(label)) return;
    setReturnSelectedSeats((p) => (p.includes(label) ? p.filter((s) => s !== label) : [...p, label]));
  }

  async function confirm() {
    if (!session) {
      toast.error(isRTL ? 'سجل دخول أولاً' : 'Please sign in first');
      router.push('/login');
      return;
    }
    if (selectedSeats.length === 0) {
      toast.error(t('v2.pickSeatsFirst'));
      return;
    }
    setBooking(true);
    const stops = trip?.tripStops || [];
    const isDirect = stops.length === 0;
    const outFrom = fromStationId || stops[0]?.stationId || null;
    const outTo = toStationId || stops[stops.length - 1]?.stationId || null;
    if (!isDirect && (!outFrom || !outTo)) {
      toast.error(isRTL ? 'اختر محطات الصعود والنزول' : 'Select boarding and alighting stations');
      setBooking(false);
      return;
    }

    const seats = selectedSeats.map((seatLabel) => ({
      seatLabel,
      passengerName: names[seatLabel] || session.user?.name || '',
      passengerPhone: phones[seatLabel] || '',
      fromStationId: isDirect ? null : outFrom,
      toStationId: isDirect ? null : outTo,
    }));
    const rStops = returnTrip?.tripStops || [];
    const rFrom = searchParams.get('returnFromStationId') || rStops[0]?.stationId;
    const rTo = searchParams.get('returnToStationId') || rStops[rStops.length - 1]?.stationId;
    const rSeats = returnTripId && rFrom && rTo
      ? returnSelectedSeats.map((seatLabel) => ({
          seatLabel,
          passengerName: rNames[seatLabel] || session.user?.name || '',
          passengerPhone: rPhones[seatLabel] || '',
          fromStationId: rFrom,
          toStationId: rTo,
        }))
      : [];

    try {
      const done: any[] = [];
      if (isCompany) {
        const groups: { tripId: string; list: typeof seats; hotels: Record<string, string> }[] = [];
        if (seats.length > 0) groups.push({ tripId, list: seats, hotels });
        if (rSeats.length > 0 && returnTripId) groups.push({ tripId: returnTripId, list: rSeats, hotels: rHotels });
        const roundTripGroupId = groups.length > 1 ? crypto.randomUUID() : undefined;
        let ok = true;
        for (const g of groups) {
          const isRet = g.tripId === returnTripId;
          const res = await fetch('/api/company/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              tripId: g.tripId,
              passengers: g.list.map((p) => ({
                seatLabel: p.seatLabel, passengerName: p.passengerName,
                passengerPhone: p.passengerPhone, passengerHotel: g.hotels[p.seatLabel] || '',
              })),
              bookingType: 'FOR_CLIENT',
              fromStationId: isRet ? rFrom || null : outFrom,
              toStationId: isRet ? rTo || null : outTo,
              roundTripGroupId,
            }),
          });
          const data = await res.json();
          if (res.ok && data.bookings) done.push(...data.bookings);
          else { ok = false; toast.error(data.error || t('common.error')); }
        }
        if (ok && done.length > 0) {
          setConfirmed(done);
          setSelectedSeats([]); setReturnSelectedSeats([]);
          setNames({}); setPhones({}); setHotels({});
          setRNames({}); setRPhones({}); setRHotels({});
          toast.success(isRTL ? 'تم الحجز بنجاح، تأكد من الدفع في صفحة الحجوزات' : 'Booked successfully, confirm payment in bookings page');
        }
      } else {
        const all = [...seats.map((s) => ({ ...s, tid: tripId })), ...rSeats.map((s) => ({ ...s, tid: returnTripId! }))];
        let okCount = 0;
        for (const s of all) {
          const res = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              tripId: s.tid, seatLabel: s.seatLabel, passengerName: s.passengerName,
              passengerPhone: s.passengerPhone, fromStationId: s.fromStationId, toStationId: s.toStationId,
            }),
          });
          const data = await res.json();
          if (res.ok) { okCount++; done.push(data); }
          else if (data.error === 'SEAT_TAKEN') toast.error(isRTL ? `المقعد ${s.seatLabel} محجوز` : `Seat ${s.seatLabel} is taken`);
          else toast.error(data.error || t('common.error'));
        }
        if (okCount > 0) {
          setConfirmed(done);
          setSelectedSeats([]); setReturnSelectedSeats([]);
          setNames({}); setPhones({}); setRNames({}); setRPhones({});
        }
      }
    } catch {
      toast.error(t('common.error'));
    }
    setBooking(false);
  }

  const stepIdx = STEPS.indexOf(step);
  const stops = trip?.tripStops || [];
  const fromStop = stops.find((s) => s.stationId === fromStationId);
  const toStop = stops.find((s) => s.stationId === toStationId);
  const seatsLeft = trip ? (trip.bus?.layout?.seats.length || 0) - reserved.size : 0;

  return (
    <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container pb-24 pt-8 md:pb-16 md:pt-10">
        {loading ? (
          <div className="grid gap-4" role="status">
            <V2Skeleton className="h-9 w-64" />
            <V2Skeleton className="h-[380px] rounded-2xl" />
          </div>
        ) : !trip || missing ? (
          <div className="v2-card mx-auto max-w-[480px] p-10 text-center">
            <p className="text-[18px] font-extrabold text-[#0B1B33]">{t('v2.tripNotFound')}</p>
            <Link href="/trips" className="v2-btn-ghost mt-6 inline-flex px-6 py-3.5 text-[15px]">{t('v2.back')}</Link>
          </div>
        ) : (
          <>
            {/* Stepper */}
            <ol className="flex items-center gap-1.5 overflow-x-auto" aria-label="Booking steps">
              {STEPS.map((s, i) => (
                <li key={s} className="flex shrink-0 items-center gap-1.5">
                  <span className={cn(
                    'rounded-full px-3.5 py-2 text-[13px] font-bold tabular-nums',
                    i < stepIdx && 'bg-emerald-50 text-emerald-700',
                    i === stepIdx && 'bg-[#0A1E3C] text-white',
                    i > stepIdx && 'bg-white text-[#5B6B84] ring-1 ring-slate-200'
                  )}>
                    {i + 1}. {t(`v2.step${s[0].toUpperCase()}${s.slice(1)}`)}
                  </span>
                  {i < STEPS.length - 1 && <ArrowRight className="size-4 shrink-0 text-slate-300 v2-flip-rtl" aria-hidden="true" />}
                </li>
              ))}
            </ol>

            <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1fr_340px]">
              <div className="min-w-0">
                {step === 'details' && (
                  <div className="v2-card p-6 md:p-8">
                    <div className="flex flex-wrap items-center gap-2">
                      <V2StatusBadge tone={seatsLeft > 0 ? 'green' : 'red'}>
                        {seatsLeft > 0 ? `${seatsLeft} ${t('v2.seatsLeft')}` : t('v2.soldOut')}
                      </V2StatusBadge>
                      <V2StatusBadge tone="blue">{stops.length === 0 ? t('v2.direct') : `${stops.length} ${t('v2.stops')}`}</V2StatusBadge>
                      {trip.bus?.type && <V2StatusBadge tone="slate">{trip.bus.type}</V2StatusBadge>}
                    </div>
                    <h1 className="mt-4 text-balance text-[26px] font-extrabold leading-tight text-[#0B1B33] md:text-[34px]">
                      {isRTL ? `${trip.destination} ← ${trip.origin}` : `${trip.origin} → ${trip.destination}`}
                    </h1>
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[15px] font-semibold tabular-nums text-[#0B1B33]">
                      <span className="inline-flex items-center gap-1.5"><Clock className="size-5 text-[#1D5BD8]" /> {fmtTime(trip.departure, lang)} → {fmtTime(trip.arrival, lang)}</span>
                      <span className="text-[#5B6B84]">{fmtDate(trip.departure, lang)} · {durationOf(trip.departure, trip.arrival, lang)}</span>
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-[14px] text-[#5B6B84]">
                      <Bus className="size-5" /> {t('v2.operator')}: <strong className="text-[#0B1B33]">{trip.bus?.name}</strong>
                    </p>

                    {(fromStop || toStop) && stops.length > 0 && (
                      <button
                        onClick={() => setStopsOpen(true)}
                        className="mt-5 flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-[#F6F8FC] px-4 py-3.5 text-start text-[14.5px] font-semibold text-[#0B1B33] hover:border-[#1D5BD8]/40"
                      >
                        <MapPin className="size-5 shrink-0 text-[#1D5BD8]" />
                        {fromStop?.station?.name || '…'} {isRTL ? '←' : '→'} {toStop?.station?.name || '…'}
                      </button>
                    )}

                    {stops.length > 0 && (
                      <div className="mt-6">
                        <p className="text-[14px] font-extrabold text-[#0B1B33]">{t('v2.timeline')}</p>
                        <ol className="mt-3 grid gap-0">
                          {stops.map((s, i) => (
                            <li key={s.stationId} className="relative flex gap-3.5 pb-5 last:pb-0">
                              {i < stops.length - 1 && <span className="absolute start-[7px] top-5 h-full w-0.5 bg-slate-200" aria-hidden="true" />}
                              <span className={cn(
                                'z-10 mt-1 size-4 shrink-0 rounded-full border-[3px]',
                                s.stationId === fromStationId || s.stationId === toStationId
                                  ? 'border-[#1D5BD8] bg-white' : 'border-slate-300 bg-white'
                              )} />
                              <span>
                                <span className="block text-[15px] font-bold text-[#0B1B33]">{s.station?.name}</span>
                                <span className="block text-[13px] tabular-nums text-[#5B6B84]">
                                  {s.departureTime ? fmtTime(s.departureTime, lang) : s.arrivalTime ? fmtTime(s.arrivalTime, lang) : ''}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <div className="mt-7 flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
                      <p className="text-[24px] font-extrabold tabular-nums text-[#0B1B33]">
                        EGP {seg.toLocaleString(isRTL ? 'ar-EG' : 'en-US')}
                        <span className="ms-1.5 text-[13px] font-medium text-[#5B6B84]">{t('v2.perPassenger')}</span>
                      </p>
                      <V2Button size="lg" onClick={() => go('seats')} disabled={seatsLeft <= 0}>
                        {t('v2.continue')} <ArrowRight className="size-4 v2-flip-rtl" />
                      </V2Button>
                    </div>
                  </div>
                )}

                {step === 'seats' && (
                  <div className="v2-card p-6 md:p-8">
                    <h2 className="text-balance text-[22px] font-extrabold text-[#0B1B33]">{t('v2.stepSeats')}</h2>
                    <p className="mt-1 text-[14px] text-[#5B6B84]">{t('v2.outboundLeg')}: {isRTL ? `${trip.destination} ← ${trip.origin}` : `${trip.origin} → ${trip.destination}`}</p>
                    <div className="mt-5">
                      <V2SeatMap trip={trip} reserved={reserved} selected={selectedSeats} onToggle={toggle} basePrice={seg} lang={lang} />
                    </div>
                    {selectedSeats.length > 0 && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {selectedSeats.map((s) => (
                          <button key={s} onClick={() => toggle(s)} className="rounded-full bg-[#0A1E3C] px-4 py-2 text-[14px] font-bold tabular-nums text-white" aria-label={`Remove seat ${s}`}>
                            {s} ✕
                          </button>
                        ))}
                      </div>
                    )}
                    {returnTrip && (
                      <div className="mt-8 border-t border-slate-100 pt-6">
                        <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('v2.returnLeg')}: {isRTL ? `${returnTrip.destination} ← ${returnTrip.origin}` : `${returnTrip.origin} → ${returnTrip.destination}`}</p>
                        <div className="mt-4">
                          <V2SeatMap trip={returnTrip} reserved={returnReserved} selected={returnSelectedSeats} onToggle={toggleReturn} basePrice={returnTrip.price} lang={lang} />
                        </div>
                      </div>
                    )}
                    <div className="mt-7 flex items-center justify-between gap-3">
                      <button onClick={() => go('details')} className="rounded-xl px-5 py-3.5 text-[14.5px] font-bold text-[#5B6B84] hover:bg-slate-100">{t('v2.back')}</button>
                      <V2Button size="lg" onClick={() => (selectedSeats.length > 0 ? go('passengers') : toast.error(t('v2.pickSeatsFirst')))}>
                        {t('v2.continue')} <ArrowRight className="size-4 v2-flip-rtl" />
                      </V2Button>
                    </div>
                  </div>
                )}

                {step === 'passengers' && (
                  <div className="v2-card p-6 md:p-8">
                    <h2 className="text-balance text-[22px] font-extrabold text-[#0B1B33]">{t('v2.stepPassengers')}</h2>
                    <div className="mt-5 grid gap-4">
                      {selectedSeats.map((s) => (
                        <div key={s} className="rounded-2xl border border-slate-200 p-4">
                          <p className="flex items-center gap-2 text-[15px] font-extrabold tabular-nums text-[#0B1B33]">
                            <User className="size-5 text-[#1D5BD8]" /> {isRTL ? 'مقعد' : 'Seat'} {s}
                            <span className="ms-auto text-[14px] text-[#5B6B84]">EGP {(seatPriceOf(s)).toLocaleString(isRTL ? 'ar-EG' : 'en-US')}</span>
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <V2Input
                              value={names[s] || ''} onChange={(e) => setNames({ ...names, [s]: e.target.value })}
                              placeholder={t('v2.passengerNamePh')} aria-label={`${t('v2.passengerNamePh')} ${s}`} autoComplete="name"
                            />
                            <V2Input
                              value={phones[s] || ''} onChange={(e) => setPhones({ ...phones, [s]: e.target.value })}
                              placeholder={t('v2.passengerPhonePh')} aria-label={`${t('v2.passengerPhonePh')} ${s}`} dir="ltr" autoComplete="tel" className="tabular-nums"
                            />
                            {isCompany && (
                              <V2Input
                                value={hotels[s] || ''} onChange={(e) => setHotels({ ...hotels, [s]: e.target.value })}
                                placeholder={t('v2.hotelPh')} aria-label={`${t('v2.hotelPh')} ${s}`} className="sm:col-span-2"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                      {returnSelectedSeats.map((s) => (
                        <div key={`r-${s}`} className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                          <p className="flex items-center gap-2 text-[15px] font-extrabold tabular-nums text-[#0B1B33]">
                            <User className="size-5 text-emerald-600" /> {t('v2.returnLeg')} · {isRTL ? 'مقعد' : 'Seat'} {s}
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <V2Input value={rNames[s] || ''} onChange={(e) => setRNames({ ...rNames, [s]: e.target.value })} placeholder={t('v2.passengerNamePh')} aria-label={`${t('v2.passengerNamePh')} ${s}`} />
                            <V2Input value={rPhones[s] || ''} onChange={(e) => setRPhones({ ...rPhones, [s]: e.target.value })} placeholder={t('v2.passengerPhonePh')} aria-label={`${t('v2.passengerPhonePh')} ${s}`} dir="ltr" className="tabular-nums" />
                            {isCompany && (
                              <V2Input value={rHotels[s] || ''} onChange={(e) => setRHotels({ ...rHotels, [s]: e.target.value })} placeholder={t('v2.hotelPh')} aria-label={`${t('v2.hotelPh')} ${s}`} className="sm:col-span-2" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-7 flex items-center justify-between gap-3">
                      <button onClick={() => go('seats')} className="rounded-xl px-5 py-3.5 text-[14.5px] font-bold text-[#5B6B84] hover:bg-slate-100">{t('v2.back')}</button>
                      <V2Button size="lg" onClick={() => go('review')}>
                        {t('v2.continue')} <ArrowRight className="size-4 v2-flip-rtl" />
                      </V2Button>
                    </div>
                  </div>
                )}

                {step === 'review' && (
                  <div className="v2-card p-6 md:p-8">
                    <h2 className="text-balance text-[22px] font-extrabold text-[#0B1B33]">{t('v2.stepReview')}</h2>
                    <div className="mt-5 rounded-2xl bg-[#F6F8FC] p-5">
                      <p className="text-[16px] font-extrabold text-[#0B1B33]">
                        {isRTL ? `${trip.destination} ← ${trip.origin}` : `${trip.origin} → ${trip.destination}`}
                      </p>
                      <p className="mt-1 text-[13.5px] tabular-nums text-[#5B6B84]">
                        {fmtDate(trip.departure, lang)} · {fmtTime(trip.departure, lang)} → {fmtTime(trip.arrival, lang)} · {trip.bus?.name}
                      </p>
                      {(fromStop || toStop) && stops.length > 0 && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-[13.5px] text-[#5B6B84]">
                          <MapPin className="size-4" /> {fromStop?.station?.name} {isRTL ? '←' : '→'} {toStop?.station?.name}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 grid gap-2.5">
                      {selectedSeats.map((s) => (
                        <div key={s} className="flex items-center gap-3 text-[14.5px]">
                          <span className="rounded-lg bg-[#0A1E3C] px-3 py-1.5 font-bold tabular-nums text-white">{s}</span>
                          <span className="min-w-0 flex-1 truncate font-semibold text-[#0B1B33]">{names[s] || session?.user?.name || '—'}</span>
                          <span className="font-bold tabular-nums text-[#0B1B33]">EGP {seatPriceOf(s).toLocaleString(isRTL ? 'ar-EG' : 'en-US')}</span>
                        </div>
                      ))}
                      {returnSelectedSeats.map((s) => (
                        <div key={`r-${s}`} className="flex items-center gap-3 text-[14.5px]">
                          <span className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold tabular-nums text-white">{s}</span>
                          <span className="min-w-0 flex-1 truncate font-semibold text-[#0B1B33]">{rNames[s] || session?.user?.name || '—'} · {t('v2.returnLeg')}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-5">
                      <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('v2.total')}</p>
                      <p className="text-[24px] font-extrabold tabular-nums text-[#0B1B33]">
                        EGP {(total + returnTotal).toLocaleString(isRTL ? 'ar-EG' : 'en-US')}
                      </p>
                    </div>
                    <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] font-semibold text-amber-700">
                      {t('payment.cash')}
                    </p>

                    <div className="mt-6 flex items-center justify-between gap-3">
                      <button onClick={() => go('passengers')} className="rounded-xl px-5 py-3.5 text-[14.5px] font-bold text-[#5B6B84] hover:bg-slate-100">{t('v2.back')}</button>
                      <V2Button size="lg" disabled={booking} onClick={confirm}>
                        {booking && <Loader2 className="size-5 animate-spin" />}
                        {booking ? t('v2.bookingNow') : t('v2.confirmBooking')}
                      </V2Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Sticky summary */}
              <aside className="v2-card hidden p-5 lg:block sticky top-24">
                <p className="text-[15px] font-extrabold text-[#0B1B33]">{t('v2.orderSummary')}</p>
                <p className="mt-1.5 text-[13.5px] tabular-nums text-[#5B6B84]">
                  {fmtDate(trip.departure, lang)} · {trip.bus?.name}
                </p>
                <div className="mt-4 grid gap-2">
                  {selectedSeats.length === 0 && returnSelectedSeats.length === 0 && (
                    <p className="text-[13.5px] text-[#9AA8BD]">{t('v2.pickSeatsFirst')}</p>
                  )}
                  {selectedSeats.map((s) => (
                    <div key={s} className="flex items-center justify-between text-[14px]">
                      <span className="font-bold tabular-nums text-[#0B1B33]">{isRTL ? 'مقعد' : 'Seat'} {s}</span>
                      <span className="tabular-nums text-[#5B6B84]">EGP {seatPriceOf(s).toLocaleString(isRTL ? 'ar-EG' : 'en-US')}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <span className="text-[14.5px] font-extrabold text-[#0B1B33]">{t('v2.total')}</span>
                  <span className="text-[20px] font-extrabold tabular-nums text-[#0B1B33]">
                    EGP {(total + returnTotal).toLocaleString(isRTL ? 'ar-EG' : 'en-US')}
                  </span>
                </div>
              </aside>
            </div>

            {/* Mobile bottom bar */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] tabular-nums text-[#5B6B84]">
                    {selectedSeats.length > 0 ? `${selectedSeats.join(', ')}` : t('v2.pickSeatsFirst')}
                  </p>
                  <p className="text-[17px] font-extrabold tabular-nums text-[#0B1B33]">
                    EGP {(total + returnTotal).toLocaleString(isRTL ? 'ar-EG' : 'en-US')}
                  </p>
                </div>
                {step === 'details' && <V2Button onClick={() => go('seats')} disabled={seatsLeft <= 0}>{t('v2.continue')}</V2Button>}
                {step === 'seats' && <V2Button onClick={() => (selectedSeats.length > 0 ? go('passengers') : toast.error(t('v2.pickSeatsFirst')))}>{t('v2.continue')}</V2Button>}
                {step === 'passengers' && <V2Button onClick={() => go('review')}>{t('v2.continue')}</V2Button>}
                {step === 'review' && (
                  <V2Button disabled={booking} onClick={confirm}>
                    {booking ? t('v2.bookingNow') : t('v2.confirmBooking')}
                  </V2Button>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Stop selector */}
      <AnimatePresence>
        {stopsOpen && stops.length > 2 && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={t('v2.pickStops')}>
            <div className="absolute inset-0 bg-[#0B1B33]/60" onClick={() => (fromStationId && toStationId ? setStopsOpen(false) : undefined)} />
            <motion.div
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-[480px] rounded-2xl bg-white p-6"
            >
              <p className="text-[18px] font-extrabold text-[#0B1B33]">{t('v2.pickStops')}</p>
              <div className="mt-4 grid gap-3">
                <V2Field label={t('v2.boardFrom')}>
                  <V2Select value={fromStationId || ''} onChange={(e) => setFromStationId(e.target.value)}>
                    {stops.map((s) => (
                      <option key={s.stationId} value={s.stationId}>{s.station?.name}</option>
                    ))}
                  </V2Select>
                </V2Field>
                <V2Field label={t('v2.alightAt')}>
                  <V2Select value={toStationId || ''} onChange={(e) => setToStationId(e.target.value)}>
                    {stops.map((s) => (
                      <option key={s.stationId} value={s.stationId}>{s.station?.name}</option>
                    ))}
                  </V2Select>
                </V2Field>
              </div>
              <V2Button
                size="lg" className="mt-5 w-full"
                disabled={!fromStationId || !toStationId || fromStationId === toStationId}
                onClick={() => setStopsOpen(false)}
              >
                <Check className="size-5" /> {t('v2.confirmStops')}
              </V2Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success */}
      <AnimatePresence>
        {confirmed.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={t('v2.bookedOk')}>
            <div className="absolute inset-0 bg-[#0B1B33]/60" onClick={() => setConfirmed([])} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-white p-6 md:p-8"
            >
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="size-8" />
              </span>
              <p className="mt-4 text-center text-[22px] font-extrabold text-[#0B1B33]">{t('v2.bookedOk')}</p>
              <p className="mx-auto mt-2 max-w-[380px] text-center text-pretty text-[14.5px] text-[#5B6B84]">{t('v2.bookedPending')}</p>
              <div className="mt-5 rounded-2xl bg-[#F6F8FC] p-4">
                <p className="text-[14px] font-extrabold tabular-nums text-[#0B1B33]">
                  {isRTL ? `${trip?.destination} ← ${trip?.origin}` : `${trip?.origin} → ${trip?.destination}`}
                </p>
                <p className="mt-1 text-[13.5px] tabular-nums text-[#5B6B84]">
                  {trip && fmtDate(trip.departure, lang)} · {confirmed.map((b: any) => b.booking?.seatLabel || b.seatLabel).filter(Boolean).slice(0, 6).join(', ')}
                </p>
                <p className="mt-1 font-mono text-[12.5px] tabular-nums text-[#5B6B84]" dir="ltr" style={{ textAlign: 'start' }}>
                  {[confirmed[0]?.booking?.reference || confirmed[0]?.reference].filter(Boolean).join('')}
                </p>
              </div>
              <div className="mt-6 grid gap-2.5">
                <V2Button
                  size="lg" className="w-full"
                  onClick={() => router.push(isCompany ? '/company/bookings' : '/bookings')}
                >
                  {t('v2.viewBookings')} <ArrowRight className="size-4 v2-flip-rtl" />
                </V2Button>
                <button
                  onClick={() => { setConfirmed([]); go('details'); }}
                  className="rounded-xl px-5 py-3.5 text-[14.5px] font-bold text-[#5B6B84] hover:bg-slate-100"
                >
                  {t('v2.bookAnother')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <V2SiteFooter />
    </div>
  );
}

export default function TripDetailPage() {
  return (
    <Suspense>
      <TripContent />
    </Suspense>
  );
}
