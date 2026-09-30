'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Search, MapPin, Clock, ArrowRight, Bus, Repeat, ArrowLeftRight, ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2Button } from '@/components/v2/Button';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import {
  V2NoResults, V2ErrorState, V2TripCardSkeleton, V2StatusBadge, V2EmptyState,
} from '@/components/v2/ui';

/* Safro V2 trip search + results — same APIs and behaviors as V1, new experience. */

interface Station { id: string; name: string; city: string }
interface TripStop {
  stationId: string; station?: Station; stopOrder: number;
  priceFromOrigin: number; arrivalTime?: string; departureTime?: string;
}
interface Trip {
  id: string; origin: string; destination: string;
  departure: string; arrival: string; price: number; calculatedPrice?: number;
  boardingTime?: string; status: string;
  bus: { name: string; type: string; layout?: { seats: unknown[] } };
  bookings: unknown[]; companyBookings?: unknown[];
  tripStops?: TripStop[]; stops?: TripStop[];
}

type SortKey = 'recommended' | 'price' | 'departure' | 'seats';

function seatsOf(t: Trip): { total: number; booked: number; left: number } {
  const total = t.bus?.layout?.seats?.length || 0;
  const booked = (t.bookings?.length || 0) + (t.companyBookings?.length || 0);
  return { total, booked, left: total - booked };
}

function durationOf(dep: string, arr: string, lang: string): string {
  const ms = new Date(arr).getTime() - new Date(dep).getTime();
  if (isNaN(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return lang === 'ar' ? `${h} س ${m} د` : `${h}h ${m}m`;
}

function TripCard({
  trip, lang, index, linkBase,
}: {
  trip: Trip; lang: string; index: number; linkBase: (t: Trip) => string;
}) {
  const t = useLangStore((s) => s.t);
  const { left } = seatsOf(trip);
  const soldOut = left <= 0;
  const price = trip.calculatedPrice || trip.price;
  const stops = (trip.tripStops || trip.stops || []).filter((s) => s.station?.name);
  const isDirect = stops.length === 0;
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut', delay: Math.min(index, 6) * 0.05 }}
      className="v2-card v2-hover-lift p-5 md:p-6"
    >
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <V2StatusBadge tone={soldOut ? 'red' : 'green'}>
              {soldOut ? t('v2.soldOut') : `${left} ${t('v2.seatsLeft')}`}
            </V2StatusBadge>
            <V2StatusBadge tone="blue">{isDirect ? t('v2.direct') : `${stops.length} ${t('v2.stops')}`}</V2StatusBadge>
            {trip.bus?.type && <V2StatusBadge tone="slate">{trip.bus.type}</V2StatusBadge>}
          </div>

          <p className="mt-3 text-balance text-[18px] font-extrabold leading-snug text-[#0B1B33]">
            {lang === 'ar' ? `${trip.destination} ← ${trip.origin}` : `${trip.origin} → ${trip.destination}`}
          </p>

          <p className="mt-2 text-[15px] font-bold tabular-nums text-[#0B1B33]" dir="ltr" style={{ textAlign: 'start' }}>
            {new Date(trip.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            {' → '}
            {new Date(trip.arrival).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            <span className="ms-2.5 text-[13px] font-medium text-[#5B6B84]">
              {new Date(trip.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
            </span>
          </p>

          <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] text-[#5B6B84]">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" /> {durationOf(trip.departure, trip.arrival, lang)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Bus className="size-4" /> {trip.bus?.name}
            </span>
            {trip.boardingTime && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {new Date(trip.boardingTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </>
            )}
          </p>

          {stops.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-[#5B6B84]">
              <MapPin className="mt-1 size-4 shrink-0" />
              <span className="truncate">
                {stops.map((s) => s.station!.name).join(lang === 'ar' ? ' ← ' : ' → ')}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4 md:w-[210px] md:flex-col md:items-end md:justify-center md:border-s md:border-t-0 md:ps-6 md:pt-0">
          <p className="text-[24px] font-extrabold tabular-nums text-[#0B1B33]">
            {price.toLocaleString(locale)}
            <span className="ms-1.5 block text-[12.5px] font-medium text-[#5B6B84] md:inline">
              EGP {t('v2.perPassenger')}
            </span>
          </p>
          {soldOut ? (
            <span className="cursor-not-allowed rounded-xl bg-slate-100 px-6 py-3.5 text-[14.5px] font-bold text-slate-400">
              {t('v2.soldOut')}
            </span>
          ) : (
            <Link href={linkBase(trip)} className="v2-btn-primary px-6 py-3.5 text-[14.5px]">
              {t('v2.selectTrip')} →
            </Link>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function TripsContent() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const params = useSearchParams();

  const [stations, setStations] = useState<Station[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [returnTrips, setReturnTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [fromStationId, setFromStationId] = useState(params.get('fromStationId') || '');
  const [toStationId, setToStationId] = useState(params.get('toStationId') || '');
  const [date, setDate] = useState(params.get('date') || '');
  const [roundTrip, setRoundTrip] = useState(false);
  const [returnDate, setReturnDate] = useState(params.get('returnDate') || '');
  const [selectedReturnTrip, setSelectedReturnTrip] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('recommended');
  const [directOnly, setDirectOnly] = useState(false);
  const [hideSoldOut, setHideSoldOut] = useState(false);

  useEffect(() => {
    fetch('/api/stations').then((r) => r.json()).then((d) => {
      const list = d.stations || d;
      if (Array.isArray(list)) setStations(list);
    }).catch(() => {});
  }, []);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const q = new URLSearchParams();
      if (fromStationId) q.set('fromStationId', fromStationId);
      if (toStationId) q.set('toStationId', toStationId);
      if (date) q.set('date', date);
      if (roundTrip && returnDate) q.set('returnDate', returnDate);
      q.set('all', 'true');
      const res = await fetch(`/api/trips?${q}`);
      if (res.status === 401) {
        // Existing backend rule: search requires a signed-in user. UI-only handling.
        setUnauthorized(true);
        setTrips([]);
        setReturnTrips([]);
        return;
      }
      setUnauthorized(false);
      const json = await res.json();
      setTrips(Array.isArray(json.data) ? json.data : []);
      setReturnTrips(Array.isArray(json.returnTrips) ? json.returnTrips : []);
      setSelectedReturnTrip(null);
    } catch {
      setFailed(true);
      setTrips([]);
      setReturnTrips([]);
    } finally {
      setLoading(false);
    }
  }, [fromStationId, toStationId, date, roundTrip, returnDate]);

  useEffect(() => {
    loadTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fromStationId && !toStationId && !date && !returnDate) return;
    const timer = setTimeout(() => loadTrips(), 350);
    return () => clearTimeout(timer);
  }, [fromStationId, toStationId, date, returnDate, roundTrip, loadTrips]);

  const visible = useMemo(() => {
    let list = [...trips];
    if (directOnly) list = list.filter((x) => ((x.tripStops || x.stops || []).length === 0));
    if (hideSoldOut) list = list.filter((x) => seatsOf(x).left > 0);
    switch (sort) {
      case 'price':
        list.sort((a, b) => (a.calculatedPrice || a.price) - (b.calculatedPrice || b.price));
        break;
      case 'departure':
        list.sort((a, b) => +new Date(a.departure) - +new Date(b.departure));
        break;
      case 'seats':
        list.sort((a, b) => seatsOf(b).left - seatsOf(a).left);
        break;
    }
    return list;
  }, [trips, sort, directOnly, hideSoldOut]);

  function linkBase(trip: Trip): string {
    let base = `/trips/${trip.id}?fromStationId=${fromStationId}&toStationId=${toStationId}`;
    if (roundTrip && selectedReturnTrip) base += `&returnTripId=${selectedReturnTrip}&returnDate=${returnDate}`;
    return base;
  }

  const fromName = stations.find((s) => s.id === fromStationId)?.name;
  const toName = stations.find((s) => s.id === toStationId)?.name;

  return (
    <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container pb-16 pt-8 md:pt-10">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
          <h1 className="text-balance text-[28px] font-extrabold text-[#0B1B33] md:text-[36px]">{t('v2.searchTitle')}</h1>
          <p className="mt-2 text-pretty text-[15px] text-[#5B6B84] md:text-[16px]">{t('v2.searchSub')}</p>
        </motion.div>

        {/* ── SEARCH CARD ── */}
        <form
          onSubmit={(e) => { e.preventDefault(); loadTrips(); }}
          className="v2-card mt-6 p-4 md:p-5"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <button
              type="button"
              onClick={() => { setRoundTrip(!roundTrip); setSelectedReturnTrip(null); if (roundTrip) setReturnDate(''); }}
              aria-pressed={roundTrip}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-bold transition',
                roundTrip ? 'border-[#1D5BD8]/30 bg-[#EFF4FF] text-[#1D5BD8]' : 'border-slate-200 text-[#5B6B84]'
              )}
            >
              <Repeat className="size-4" /> {t('v2.roundTrip')}
            </button>
            {roundTrip && (
              <V2StatusBadge tone="green">{t('v2.oneWay')} + {t('v2.roundTrip')}</V2StatusBadge>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
            <V2Field label={t('v2.from')}>
              <span className="relative block">
                <MapPin className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
                <V2Select value={fromStationId} onChange={(e) => setFromStationId(e.target.value)} aria-label={t('v2.from')} className="appearance-none ps-11">
                  <option value="">{t('v2.allStations')}</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>
                  ))}
                </V2Select>
              </span>
            </V2Field>
            <V2Field label={t('v2.to')}>
              <span className="relative block">
                <MapPin className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
                <V2Select value={toStationId} onChange={(e) => setToStationId(e.target.value)} aria-label={t('v2.to')} className="appearance-none ps-11">
                  <option value="">{t('v2.allStations')}</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>
                  ))}
                </V2Select>
              </span>
            </V2Field>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              <V2Field label={t('v2.date')}>
                <V2Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('v2.date')} className="tabular-nums" />
              </V2Field>
              {roundTrip && (
                <V2Field label={t('v2.travelDate')}>
                  <V2Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} aria-label={t('v2.travelDate')} className="tabular-nums" />
                </V2Field>
              )}
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                aria-label="Swap origin and destination"
                onClick={() => { setFromStationId(toStationId); setToStationId(fromStationId); }}
                className="grid min-h-[52px] w-[52px] shrink-0 place-items-center rounded-xl border border-slate-200 text-[#1D5BD8] hover:bg-slate-50 lg:min-h-[60px] lg:w-[60px]"
              >
                <ArrowLeftRight className="size-5 v2-flip-rtl" />
              </button>
              <V2Button type="submit" size="lg" className="flex-1">
                <Search className="size-5 v2-flip-rtl" /> {t('v2.searchTrips')}
              </V2Button>
            </div>
          </div>
        </form>

        {/* ── SORT + FILTER BAR ── */}
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-[13.5px] font-bold text-[#0B1B33]">
            <ArrowUpDown className="size-4" />
            <span className="tabular-nums">
              {loading ? '…' : `${visible.length} ${t('v2.resultsTitle')}`}
            </span>
          </span>
          {(fromName || toName) && !loading && (
            <span className="text-[13.5px] text-[#5B6B84]">
              {fromName || '…'} {isRTL ? '←' : '→'} {toName || '…'}
            </span>
          )}
          <span className="ms-auto flex flex-wrap items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13.5px] font-semibold text-[#0B1B33]"
            >
              <option value="recommended">{isRTL ? 'موصى به' : 'Recommended'}</option>
              <option value="price">{isRTL ? 'السعر: الأقل أولًا' : 'Price: lowest'}</option>
              <option value="departure">{isRTL ? 'الأبكر مغادرة' : 'Earliest departure'}</option>
              <option value="seats">{isRTL ? 'المقاعد المتاحة' : 'Most seats'}</option>
            </select>
            <button
              type="button" aria-pressed={directOnly} onClick={() => setDirectOnly(!directOnly)}
              className={cn('rounded-xl border px-3.5 py-2.5 text-[13.5px] font-bold transition', directOnly ? 'border-[#1D5BD8]/30 bg-[#EFF4FF] text-[#1D5BD8]' : 'border-slate-200 bg-white text-[#5B6B84]')}
            >
              {t('v2.direct')}
            </button>
            <button
              type="button" aria-pressed={hideSoldOut} onClick={() => setHideSoldOut(!hideSoldOut)}
              className={cn('rounded-xl border px-3.5 py-2.5 text-[13.5px] font-bold transition', hideSoldOut ? 'border-[#1D5BD8]/30 bg-[#EFF4FF] text-[#1D5BD8]' : 'border-slate-200 bg-white text-[#5B6B84]')}
            >
              {isRTL ? 'إخفاء المكتمل' : 'Hide sold out'}
            </button>
          </span>
        </div>

        {/* ── RESULTS ── */}
        <div className="mt-5">
          {loading ? (
            <div className="grid gap-4" role="status" aria-label={t('v2.loadingTrips')}>
              <V2TripCardSkeleton />
              <V2TripCardSkeleton />
              <V2TripCardSkeleton />
            </div>
          ) : unauthorized ? (
            <V2EmptyState
              title={t('v2.loginToSearch')}
              desc={t('v2.loginToSearchDesc')}
              actionLabel={t('v2.login')}
              onAction={() => { window.location.href = '/login'; }}
            />
          ) : failed ? (
            <V2ErrorState title={t('v2.loadFailed')} desc={t('v2.loadFailedDesc')} retryLabel={t('v2.retry')} onRetry={loadTrips} />
          ) : visible.length === 0 ? (
            <V2NoResults
              title={t('v2.noTrips')}
              desc={t('v2.noTripsDesc')}
              actionLabel={t('v2.clearFilters')}
              onAction={() => { setFromStationId(''); setToStationId(''); setDate(''); setReturnDate(''); setDirectOnly(false); setHideSoldOut(false); }}
            />
          ) : (
            <div className="grid gap-4">
              {visible.map((trip, i) => (
                <TripCard key={trip.id} trip={trip} lang={lang} index={i} linkBase={linkBase} />
              ))}
            </div>
          )}

          {/* ── RETURN TRIPS ── */}
          {!loading && !failed && roundTrip && (
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-3">
                <span className="h-6 w-1 rounded-full bg-emerald-500" />
                <h2 className="text-[20px] font-extrabold text-[#0B1B33]">
                  {isRTL ? 'رحلة العودة' : 'Return trip'}
                </h2>
                {selectedReturnTrip && <V2StatusBadge tone="green">{isRTL ? 'تم الاختيار' : 'Selected'}</V2StatusBadge>}
              </div>
              {returnTrips.length > 0 ? (
                <div className="grid gap-3">
                  {returnTrips.map((rt) => {
                    const { left } = seatsOf(rt);
                    const selected = selectedReturnTrip === rt.id;
                    return (
                      <button
                        key={rt.id} type="button" onClick={() => setSelectedReturnTrip(rt.id)}
                        aria-pressed={selected}
                        className={cn(
                          'v2-card flex items-center gap-4 p-5 text-start transition',
                          selected && 'border-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.4)]'
                        )}
                      >
                        <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border-2', selected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300')}>
                          {selected && <span className="size-2 rounded-full bg-white" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15.5px] font-extrabold text-[#0B1B33]">
                            {isRTL ? `${rt.destination} ← ${rt.origin}` : `${rt.origin} → ${rt.destination}`}
                          </span>
                          <span className="mt-1 block text-[13px] tabular-nums text-[#5B6B84]">
                            {new Date(rt.departure).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' })}
                            {' · '}
                            {new Date(rt.departure).toLocaleTimeString(isRTL ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                        <span className="shrink-0 text-[16px] font-extrabold tabular-nums text-[#0B1B33]">
                          {(rt.calculatedPrice || rt.price).toLocaleString(isRTL ? 'ar-EG' : 'en-US')}
                          <span className="ms-1 text-[12px] font-medium text-[#5B6B84]">EGP</span>
                        </span>
                        <span className="hidden shrink-0 text-[12.5px] tabular-nums text-[#5B6B84] sm:block">
                          {left} {t('v2.seatsLeft')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white py-8 text-center text-[14.5px] text-[#5B6B84]">
                  {isRTL ? 'لا توجد رحلات عودة مطابقة' : 'No matching return trips'}
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      <V2SiteFooter />
    </div>
  );
}

export default function TripsPage() {
  return (
    <Suspense>
      <TripsContent />
    </Suspense>
  );
}
