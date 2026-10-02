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
import { V2Field } from '@/components/v2/Field';
import { V2DatePicker } from '@/components/v2/DatePicker';
import { StationPicker } from '@/components/v2/StationPicker';
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
  trip, lang, index, linkBase, selectAction,
}: {
  trip: Trip; lang: string; index: number; linkBase: (t: Trip) => string;
  selectAction?: { label: string; onSelect: () => void };
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
          ) : selectAction ? (
            <button onClick={selectAction.onSelect} className="v2-btn-primary px-6 py-3.5 text-[14.5px]">
              {selectAction.label}
            </button>
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
  const locale = isRTL ? 'ar-EG' : 'en-US';
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
  const [roundTrip, setRoundTrip] = useState(params.get('roundTrip') === '1');
  const [returnDate, setReturnDate] = useState(params.get('returnDate') || '');
  const [selectedReturnTrip, setSelectedReturnTrip] = useState<string | null>(null);
  const [leg, setLeg] = useState<'out' | 'ret'>('out');
  const [pickedOut, setPickedOut] = useState<Trip | null>(null);
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
      setPickedOut(null);
      setLeg('out');
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
          <div className="flex gap-1 rounded-xl bg-[#F1F4F9] p-1.5" role="tablist" aria-label={t('v2.tripType')}>
            {(
              [
                { key: false, label: t('v2.oneWay') },
                { key: true, label: t('v2.roundTrip') },
              ] as const
            ).map((tab) => (
              <button
                key={String(tab.key)}
                type="button"
                role="tab"
                aria-selected={roundTrip === tab.key}
                onClick={() => {
                  setRoundTrip(tab.key);
                  setSelectedReturnTrip(null);
                  setPickedOut(null);
                  setLeg('out');
                  if (!tab.key) setReturnDate('');
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-bold transition',
                  roundTrip === tab.key ? 'bg-[#0A1E3C] text-white shadow' : 'text-[#5B6B84]'
                )}
              >
                {tab.key && <Repeat className="size-4" />} {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
            <V2Field label={t('v2.from')}>
              <StationPicker
                value={fromStationId}
                onChange={setFromStationId}
                placeholder={t('v2.allStations')}
                emptyLabel={t('v2.allStations')}
                ariaLabel={t('v2.from')}
                excludeId={toStationId || undefined}
              />
            </V2Field>
            <V2Field label={t('v2.to')}>
              <StationPicker
                value={toStationId}
                onChange={setToStationId}
                placeholder={t('v2.allStations')}
                emptyLabel={t('v2.allStations')}
                ariaLabel={t('v2.to')}
                excludeId={fromStationId || undefined}
              />
            </V2Field>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              <div className="grid gap-2">
                <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('v2.date')}</span>
                <V2DatePicker
                  value={date}
                  onChange={(v) => {
                    setDate(v);
                    if (roundTrip && returnDate && returnDate < v) setReturnDate(v);
                  }}
                  label={t('v2.date')}
                />
              </div>
              {roundTrip && (
                <div className="grid gap-2">
                  <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('v2.returnDate')}</span>
                  <V2DatePicker value={returnDate} onChange={setReturnDate} min={date || undefined} label={t('v2.returnDate')} />
                </div>
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
          ) : !roundTrip ? (
            <div className="grid gap-4">
              {visible.map((trip, i) => (
                <TripCard key={trip.id} trip={trip} lang={lang} index={i} linkBase={linkBase} />
              ))}
            </div>
          ) : leg === 'out' ? (
            <div>
              <div className="mb-4 flex items-center gap-2" aria-label={t('v2.outboundStep')}>
                <span className="rounded-full bg-[#0A1E3C] px-3.5 py-2 text-[13px] font-bold tabular-nums text-white">1 · {t('v2.outboundStep')}</span>
                <span className="rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-[#5B6B84] ring-1 ring-slate-200">2 · {t('v2.returnStep')}</span>
              </div>
              <div className="grid gap-4">
                {visible.map((trip, i) => (
                  <TripCard
                    key={trip.id} trip={trip} lang={lang} index={i} linkBase={linkBase}
                    selectAction={{
                      label: t('v2.pickOutbound'),
                      onSelect: () => {
                        setPickedOut(trip);
                        setSelectedReturnTrip(null);
                        setLeg('ret');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      },
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center gap-2" aria-label={t('v2.returnStep')}>
                <button
                  onClick={() => setLeg('out')}
                  className="rounded-full bg-emerald-50 px-3.5 py-2 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100"
                >
                  ✓ 1 · {t('v2.outboundStep')}
                </button>
                <span className="rounded-full bg-[#0A1E3C] px-3.5 py-2 text-[13px] font-bold tabular-nums text-white">2 · {t('v2.returnStep')}</span>
              </div>
              {returnTrips.length > 0 ? (
                <div className="grid gap-4">
                  {returnTrips.map((rt, i) => {
                    const selected = selectedReturnTrip === rt.id;
                    return (
                      <div key={rt.id} className={cn(selected && 'rounded-2xl ring-2 ring-emerald-500')}>
                        <TripCard
                          trip={rt} lang={lang} index={i} linkBase={linkBase}
                          selectAction={{
                            label: selected ? (isRTL ? 'تم اختيار العودة ✓' : 'Return picked ✓') : t('v2.pickReturn'),
                            onSelect: () => setSelectedReturnTrip(rt.id),
                          }}
                        />
                      </div>
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

          {/* ── RT SUMMARY BAR ── */}
          {roundTrip && pickedOut && !loading && !failed && (
            <div className="sticky bottom-4 z-20 mt-6 rounded-2xl border border-[#E6EBF2] bg-white/95 p-4 shadow-[0_24px_64px_rgba(11,27,51,0.18)] backdrop-blur md:p-5">
              <div className="grid gap-2.5 text-[13.5px] sm:grid-cols-2">
                <p className="truncate font-bold text-[#0B1B33]">
                  <span className="text-[#5B6B84]">{t('v2.outboundStep')}: </span>
                  {isRTL ? `${pickedOut.destination} ← ${pickedOut.origin}` : `${pickedOut.origin} → ${pickedOut.destination}`}
                  {' · '}<span className="tabular-nums">EGP {(pickedOut.calculatedPrice || pickedOut.price).toLocaleString(locale)}</span>
                </p>
                <p className="truncate font-bold text-[#0B1B33]">
                  <span className="text-[#5B6B84]">{t('v2.returnStep')}: </span>
                  {(() => {
                    const rt = returnTrips.find((x) => x.id === selectedReturnTrip);
                    return rt
                      ? `${isRTL ? `${rt.destination} ← ${rt.origin}` : `${rt.origin} → ${rt.destination}`} · EGP ${(rt.calculatedPrice || rt.price).toLocaleString(locale)}`
                      : '…';
                  })()}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
                <p className="text-[18px] font-extrabold tabular-nums text-[#0B1B33]">
                  {t('v2.total')}: EGP {(
                    (pickedOut.calculatedPrice || pickedOut.price) +
                    (() => {
                      const rt = returnTrips.find((x) => x.id === selectedReturnTrip);
                      return rt ? (rt.calculatedPrice || rt.price) : 0;
                    })()
                  ).toLocaleString(locale)}
                </p>
                {selectedReturnTrip ? (
                  <Link
                    href={`/trips/${pickedOut.id}?fromStationId=${fromStationId}&toStationId=${toStationId}&returnTripId=${selectedReturnTrip}&returnDate=${returnDate}`}
                    className="v2-btn-primary ms-auto px-6 py-3.5 text-[14.5px]"
                  >
                    {t('v2.continue')} →
                  </Link>
                ) : (
                  <span className="ms-auto rounded-xl bg-slate-100 px-6 py-3.5 text-[14.5px] font-bold text-slate-400">
                    {t('v2.pickReturn')}
                  </span>
                )}
              </div>
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
