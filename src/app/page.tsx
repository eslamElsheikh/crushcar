'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  MapPin, Users, ArrowLeftRight, Search,
  Zap, ShieldCheck, Leaf, ArrowRight, Clock, Star, Bus,
  TicketCheck, Check, LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2SectionHeading } from '@/components/v2/ui';
import { V2DatePicker } from '@/components/v2/DatePicker';
import { StationPicker } from '@/components/v2/StationPicker';
import { normAr } from '@/lib/arabic';
import { cairoTodayISO } from '@/lib/search-ar';
import {
  HOME_DESTINATIONS_LIMIT, HOME_TRIPS_LIMIT,
  dedupeDestinations, dedupeTrips,
  destinationImage, tripImageForDestination,
} from '@/lib/destinationImages';

/* Safro V2 homepage — real backend data only. No mock trips. */

interface Station { id: string; name: string; city: string }
interface RecentTrip {
  id: string; origin: string; destination: string;
  departure: string; arrival: string; price: number; status: string;
  bus: { id: string; name: string; type: string };
  totalSeats: number; bookedSeats: number;
}
interface Stats {
  totalBookings: number; totalRevenue: number; activeTrips: number;
  totalBuses: number; recentTrips: RecentTrip[];
}
interface Destination {
  id: string; slug: string; nameAr: string; nameEn: string | null;
  imageUrl: string | null; sortOrder: number;
}

/* Homepage display image for a destination: DB upload → governorate map → fallback. */
function destImage(dest: Destination): string {
  return destinationImage(dest);
}

function durationOf(dep: string, arr: string, lang: string): string {
  const ms = new Date(arr).getTime() - new Date(dep).getTime();
  if (isNaN(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return lang === 'ar' ? `${h} س ${m} د` : `${h}h ${m}m`;
}

export default function V2HomePage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const router = useRouter();

  const [stations, setStations] = useState<Station[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // Booking widget state (real station ids → /trips query)
  const [tripKind, setTripKind] = useState<'oneWay' | 'roundTrip'>('oneWay');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [date, setDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [searchError, setSearchError] = useState('');
  const [errors, setErrors] = useState<{ fromId?: string; toId?: string; date?: string; returnDate?: string }>({});
  const [returnNotice, setReturnNotice] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);
  const todayISO = useMemo(() => cairoTodayISO(), []);

  useEffect(() => {
    fetch('/api/stations').then((r) => r.json()).then((d) => {
      const list: Station[] = d.stations || d || [];
      if (Array.isArray(list)) setStations(list);
    }).catch(() => {});
    fetch('/api/public/stats').then((r) => r.json()).then((d) => {
      if (!d.error) setStats(d);
    }).catch(() => {});
  }, []);

  const [destinations, setDestinations] = useState<Destination[]>([]);

  useEffect(() => {
    fetch('/api/destinations').then((r) => r.json()).then((d) => {
      if (Array.isArray(d.data)) setDestinations(d.data);
    }).catch(() => {});
  }, []);

  /** Homepage: max 2 rows (8 cards on desktop), duplicates removed by Arabic name. */
  const homeDestinations = useMemo(
    () => dedupeDestinations(destinations).slice(0, HOME_DESTINATIONS_LIMIT),
    [destinations],
  );

  /** Featured trips: unique routes only, max 2 rows (8 cards on desktop). */
  const featuredTrips = useMemo(
    () => dedupeTrips(stats?.recentTrips || []).slice(0, HOME_TRIPS_LIMIT),
    [stats],
  );

  /** Station whose city matches the destination (Arabic-tolerant). */
  function stationFor(dest: Destination): Station | undefined {
    const target = normAr(dest.nameAr);
    if (!target) return undefined;
    return stations.find((s) => {
      const city = normAr(s.city || '');
      const name = normAr(s.name || '');
      return (city && (city.includes(target) || target.includes(city))) ||
        (name && (name.includes(target) || target.includes(name)));
    });
  }

  function destLink(dest: Destination): string {
    const st = stationFor(dest);
    return st ? `/trips?toStationId=${st.id}` : '/trips';
  }

  function focusField(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!fromId) errs.fromId = t('v2.required');
    if (!toId) errs.toId = t('v2.required');
    if (!date) errs.date = t('v2.required');
    if (tripKind === 'roundTrip') {
      if (!returnDate) errs.returnDate = t('v2.required');
      else if (date && returnDate < date) errs.returnDate = t('v2.returnAutoCleared');
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setSearchError('');
      focusField(errs.fromId ? 'home-from' : errs.toId ? 'home-to' : errs.date ? 'home-date' : 'home-return');
      return;
    }
    setSearchError('');
    const params = new URLSearchParams();
    if (fromId) params.set('fromStationId', fromId);
    if (toId) params.set('toStationId', toId);
    if (date) params.set('date', date);
    if (tripKind === 'roundTrip') {
      params.set('roundTrip', '1');
      params.set('returnDate', returnDate);
    }
    router.push(`/trips?${params.toString()}`);
  }

  function swapStations() {
    setFromId(toId);
    setToId(fromId);
    // Swap never breaks validation: re-check only when both were set.
    setErrors((prev) => ({ ...prev, fromId: undefined, toId: undefined }));
  }

  function setDeparture(v: string) {
    setDate(v);
    setErrors((prev) => ({ ...prev, date: undefined }));
    // A return can never precede departure: clear it + notice, then open return.
    if (v && returnDate && returnDate < v) {
      setReturnDate('');
      setErrors((prev) => ({ ...prev, returnDate: undefined }));
      setReturnNotice(t('v2.returnAutoCleared'));
    }
    if (tripKind === 'roundTrip' && v) setReturnOpen(true);
  }

  function switchTripKind(kind: 'oneWay' | 'roundTrip') {
    setTripKind(kind);
    setSearchError('');
    if (kind === 'oneWay') {
      // Hide return entirely: clear its value so the grid redistributes cleanly.
      setReturnDate('');
      setReturnNotice('');
      setReturnOpen(false);
      setErrors((prev) => ({ ...prev, returnDate: undefined }));
    }
  }

  const trust = [
    { icon: Zap, title: stats ? `${stats.activeTrips} ${isRTL ? 'رحلة نشطة' : 'active trips'}` : t('v2.trustRoutes'), sub: t('v2.trustRoutesSub') },
    { icon: MapPin, title: stations.length ? `${stations.length} ${isRTL ? 'محطة' : 'stations'}` : t('v2.trustStations'), sub: t('v2.trustStationsSub') },
    { icon: ShieldCheck, title: t('v2.trustSecure'), sub: t('v2.trustSecureSub') },
    { icon: Leaf, title: t('v2.trustGreen'), sub: t('v2.trustGreenSub') },
  ];

  const BusSeatIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-7" aria-hidden="true">
      <rect x="5" y="2.5" width="5" height="11" rx="2.2" />
      <path d="M5 6.5h5" />
      <rect x="5" y="13.5" width="14" height="3.5" rx="1.75" />
      <path d="M9 17v3.5" />
      <path d="M6.5 20.5h7" />
    </svg>
  );

  const steps = [
    { icon: Search, title: t('v2.how1t'), desc: t('v2.how1d') },
    { icon: Bus, title: t('v2.how2t'), desc: t('v2.how2d') },
    { icon: Bus, title: t('v2.how3t'), desc: t('v2.how3d'), art: BusSeatIcon },
    { icon: TicketCheck, title: t('v2.how4t'), desc: t('v2.how4d') },
  ];

  const bullets = isRTL
    ? ['حجز باص كامل ورحلات جماعية', 'مسارات ومواعيد مخصصة', 'حساب مخصص للشركات', 'خيارات دفع مرنة']
    : ['Full bus charter & group bookings', 'Custom routes and schedules', 'Dedicated company account', 'Flexible payment options'];

  return (
    <div className="v2 min-h-dvh overflow-x-clip bg-white" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader overlay />

      {/* ── HERO ── */}
      <section className="relative -mt-[76px] overflow-hidden">
        <div className="absolute inset-0">
          <Image src="/v2/hero-egypt.png" alt="" fill priority className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B1B33]/70 via-[#0B1B33]/35 to-[#0B1B33]/55" />
        </div>
        <div className="v2-container relative pb-12 pt-28 md:pb-16 md:pt-32">
          <motion.p
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="text-[12px] font-bold tracking-[0.22em] text-white/75"
          >
            {t('v2.heroEyebrow')}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.2, ease: 'easeOut', delay: 0.05 }}
            className="mt-4 max-w-[600px] text-balance text-[40px] font-extrabold leading-[1.08] text-white md:text-[64px] md:leading-[1.04]"
          >
            {t('v2.heroTitleA')}
            <br />
            <span className="bg-gradient-to-r from-[#9DBCFF] to-[#5EE6FF] bg-clip-text text-transparent">{t('v2.heroTitleB')}</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.2, ease: 'easeOut', delay: 0.1 }}
            className="mt-5 max-w-[480px] text-pretty text-[16px] leading-relaxed text-white/90 md:text-[19px]"
          >
            {t('v2.heroSubtitle')}
          </motion.p>

          {/* ── BOOKING WIDGET (real stations → /trips) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.2, ease: 'easeOut', delay: 0.15 }}
            className="mt-8 scroll-mt-24"
          >
            <div className="rounded-2xl bg-white p-2.5 shadow-[0_24px_64px_rgba(11,27,51,0.25)]">
              <div className="flex gap-1 rounded-xl bg-[#F1F4F9] p-1.5" role="tablist" aria-label={t('v2.tripType')}>
                {(
                  [
                    { key: 'oneWay', label: t('v2.oneWay') },
                    { key: 'roundTrip', label: t('v2.roundTrip') },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key} role="tab" aria-selected={tripKind === tab.key}
                    onClick={() => switchTripKind(tab.key)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-[14.5px] font-bold transition',
                      tripKind === tab.key ? 'bg-[#0A1E3C] text-white shadow' : 'text-[#5B6B84]'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <form
                onSubmit={submitSearch}
                dir="rtl"
                className={cn(
                  'grid min-w-0 gap-3 p-2.5 md:items-end',
                  tripKind === 'roundTrip'
                    ? 'md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
                    : 'md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)_auto]'
                )}
              >
                {/* From / swap / to: stacked on mobile, flattened into the grid on desktop */}
                <div className="relative grid min-w-0 gap-3 md:contents">
                  <div className="grid min-w-0 gap-2">
                    <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('v2.from')}</span>
                    <StationPicker
                      id="home-from"
                      nextId="home-to"
                      value={fromId}
                      onChange={(v) => { setFromId(v); setErrors((p) => ({ ...p, fromId: undefined })); }}
                      placeholder={t('v2.fromPh')}
                      ariaLabel={t('v2.from')}
                      excludeId={toId || undefined}
                      invalid={!!errors.fromId}
                      alwaysUp
                    />
                    {errors.fromId && (
                      <p role="alert" className="px-1 text-[12.5px] font-bold text-red-600">{errors.fromId}</p>
                    )}
                  </div>
                  {/* Desktop swap column: fixed 40px, bottom-aligned with the fields */}
                  <div className="hidden min-w-0 md:flex md:items-end">
                    <button
                      type="button" aria-label="Swap origin and destination"
                      onClick={swapStations}
                      className="grid h-12 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-[#1D5BD8] hover:bg-slate-50"
                    >
                      <ArrowLeftRight className="size-4 v2-flip-rtl" />
                    </button>
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('v2.to')}</span>
                    <StationPicker
                      id="home-to"
                      nextId="home-date"
                      value={toId}
                      onChange={(v) => { setToId(v); setErrors((p) => ({ ...p, toId: undefined })); }}
                      placeholder={t('v2.toPh')}
                      ariaLabel={t('v2.to')}
                      excludeId={fromId || undefined}
                      invalid={!!errors.toId}
                      alwaysUp
                    />
                    {errors.toId && (
                      <p role="alert" className="px-1 text-[12.5px] font-bold text-red-600">{errors.toId}</p>
                    )}
                  </div>
                  {/* Mobile swap: absolute on the edge, centered between the two fields */}
                  <button
                    type="button" aria-label="Swap origin and destination"
                    onClick={swapStations}
                    className="absolute end-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-[#1D5BD8] shadow-sm md:hidden"
                  >
                    <ArrowLeftRight className="size-4 v2-flip-rtl" />
                  </button>
                </div>
                {/* Dates: side-by-side on mobile, flattened into the grid on desktop */}
                <div className={cn('grid min-w-0 gap-3 md:contents', tripKind === 'roundTrip' ? 'grid-cols-2' : 'grid-cols-1')}>
                  <div className="grid min-w-0 gap-2">
                    <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('v2.date')}</span>
                    <V2DatePicker
                      id="home-date"
                      nextId={tripKind === 'roundTrip' ? 'home-return' : 'home-submit'}
                      value={date}
                      onChange={setDeparture}
                      min={todayISO}
                      label={t('v2.date')}
                      invalid={!!errors.date}
                    />
                    {errors.date && (
                      <p role="alert" className="px-1 text-[12.5px] font-bold text-red-600">{errors.date}</p>
                    )}
                  </div>
                  {tripKind === 'roundTrip' && (
                    <div className="grid min-w-0 gap-2">
                      <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('v2.returnDate')}</span>
                      <V2DatePicker
                        id="home-return"
                        nextId="home-submit"
                        value={returnDate}
                        onChange={(v) => { setReturnDate(v); setReturnNotice(''); setErrors((p) => ({ ...p, returnDate: undefined })); }}
                        min={date || todayISO}
                        label={t('v2.returnDate')}
                        disabled={!date}
                        invalid={!!errors.returnDate}
                        open={returnOpen}
                        onOpenChange={setReturnOpen}
                        rangeStart={date || null}
                        rangeEnd={returnDate || null}
                      />
                      {errors.returnDate ? (
                        <p role="alert" className="px-1 text-[12.5px] font-bold text-red-600">{errors.returnDate}</p>
                      ) : returnNotice ? (
                        <p role="status" className="px-1 text-[12.5px] font-semibold text-amber-600">{returnNotice}</p>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="grid min-w-0 gap-2">
                  {searchError && (
                    <p role="alert" className="px-1 text-[13px] font-bold text-red-600">{searchError}</p>
                  )}
                  <button id="home-submit" type="submit" className="v2-btn-primary flex h-12 items-center justify-center gap-2 px-7 text-[15px]">
                    <Search className="size-5 v2-flip-rtl" /> {t('v2.searchTrips')}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── TRUST ── */}
      <section className="border-b border-[#E6EBF2] bg-white">
        <div className="v2-container grid grid-cols-2 gap-x-4 gap-y-7 py-8 lg:grid-cols-4">
          {trust.map((it) => (
            <div key={it.title} className="flex items-center gap-3.5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#F1F4F9] text-[#0A1E3C]">
                <it.icon className="size-6" />
              </span>
              <span>
                <span className="block text-balance text-[15.5px] font-extrabold tabular-nums text-[#0B1B33]">{it.title}</span>
                <span className="mt-0.5 block text-[13px] text-[#5B6B84]">{it.sub}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── DESTINATIONS (DB-driven, deduped, max 2 rows = 8 cards; rest on /destinations) ── */}
      {homeDestinations.length > 0 && (
      <section id="destinations" className="scroll-mt-20 bg-white py-16 md:py-20">
        <div className="v2-container">
          <V2SectionHeading
            title={t('v2.popularTitle')}
            sub={t('v2.popularSub')}
            action={
              <Link href="/destinations" className="flex items-center gap-1.5 text-[14.5px] font-bold text-[#1D5BD8]">
                {t('v2.exploreAll')} <ArrowRight className="size-4 v2-flip-rtl" />
              </Link>
            }
          />
          <div className="v2-snap-row mt-8">
            {homeDestinations.map((dest, i) => (
              <motion.div
                key={dest.id}
                initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.2, ease: 'easeOut', delay: i * 0.06 }}
              >
                <Link href={destLink(dest)} className="v2-img-zoom v2-hover-lift group relative block overflow-hidden rounded-2xl">
                  <div className="relative aspect-[4/3] w-full bg-[#0A1E3C] lg:aspect-[3/3.4]">
                    <Image src={destImage(dest)} alt={isRTL ? dest.nameAr : (dest.nameEn || dest.nameAr)} fill sizes="(max-width:768px) 82vw, (max-width:1024px) 45vw, 22vw" className="object-cover" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B1B33]/90 via-[#0B1B33]/15 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                    <p className="text-balance text-[17px] font-bold leading-snug text-white">
                      {isRTL ? dest.nameAr : (dest.nameEn || dest.nameAr)}
                    </p>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#0B1B33]" aria-hidden="true">
                      <ArrowRight className="size-5 v2-flip-rtl" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ── HOW IT WORKS ── */}
      <section className="bg-[#F6F8FC] py-16 md:py-20">
        <div className="v2-container grid gap-12 lg:grid-cols-[340px_1fr] lg:items-center">
          <div>
            <p className="text-[12px] font-bold tracking-[0.2em] text-[#1D5BD8]">{t('v2.howEyebrow')}</p>
            <h2 className="mt-3 text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[34px]">{t('v2.howTitle')}</h2>
            <p className="mt-3 text-pretty text-[15px] leading-relaxed text-[#5B6B84] md:text-[16px]">{t('v2.howSub')}</p>
            <Link href="/trips" className="v2-btn-primary mt-6 inline-flex items-center gap-2 px-6 py-3.5 text-[15px]">
              {t('v2.howCta')} <ArrowRight className="size-4 v2-flip-rtl" />
            </Link>
          </div>
          <ol className="relative grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {/* Vertical connector (mobile) */}
            <span aria-hidden="true" className="absolute bottom-10 start-1/2 top-10 w-px -translate-x-1/2 bg-[#D7DEE8] rtl:translate-x-1/2 sm:hidden" />
            {/* Horizontal connector (desktop, follows RTL order) */}
            <span aria-hidden="true" className="absolute end-[11%] start-[11%] top-9 hidden h-px bg-[#D7DEE8] lg:block" />
            {steps.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.2, ease: 'easeOut', delay: i * 0.07 }}
                className="relative text-center"
              >
                <span className="relative z-10 mx-auto grid size-16 place-items-center rounded-2xl border border-[#D7E4F8] bg-[#EFF4FF] text-[#1D5BD8]">
                  {s.art ?? <s.icon className="size-7" strokeWidth={2} />}
                </span>
                <p className="mt-3 text-[12.5px] font-bold text-[#1D5BD8]">
                  {t('v2.stepLabel')} {i + 1}
                </p>
                <p className="mt-1 text-balance text-[17px] font-semibold text-[#0B1B33]">{s.title}</p>
                <p className="mx-auto mt-1.5 max-w-[230px] text-pretty text-[14px] leading-relaxed text-slate-600">{s.desc}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── FEATURED TRIPS (real: /api/public/stats recentTrips, unique routes, max 8; hidden when none upcoming) ── */}
      {featuredTrips.length > 0 && (
      <section id="featured" className="scroll-mt-20 bg-white py-16 md:py-20">
        <div className="v2-container">
          <V2SectionHeading
            title={t('v2.featTitle')}
            sub={t('v2.featSub')}
            action={
              <Link href="/trips" className="flex items-center gap-1.5 text-[14.5px] font-bold text-[#1D5BD8]">
                {t('v2.viewAll')} <ArrowRight className="size-4 v2-flip-rtl" />
              </Link>
            }
          />
          <div className="v2-snap-row mt-8">
            {featuredTrips.map((trip, i) => {
              const left = trip.totalSeats - trip.bookedSeats;
              const soldOut = left <= 0;
              return (
                <motion.article
                  key={trip.id}
                  initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                  transition={{ duration: 0.2, ease: 'easeOut', delay: i * 0.06 }}
                  className="v2-hover-lift flex flex-col overflow-hidden rounded-2xl border border-[#E6EBF2] bg-white"
                >
                  <div className="relative h-40 overflow-hidden bg-[#E6EBF2]">
                    <Image src={tripImageForDestination(trip.destination, destinations)} alt={isRTL ? `${trip.destination} ← ${trip.origin}` : `${trip.origin} → ${trip.destination}`} fill sizes="(max-width:768px) 82vw, 25vw" className="object-cover" />
                    <span className="absolute end-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-bold text-[#1D5BD8]">
                      {trip.bus.type || t('v2.direct')}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-balance text-[17px] font-extrabold leading-snug text-[#0B1B33]">
                      {isRTL ? `${trip.destination} ← ${trip.origin}` : `${trip.origin} → ${trip.destination}`}
                    </p>
                    <p className="mt-2 text-[14.5px] font-bold tabular-nums text-[#0B1B33]" dir="ltr" style={{ textAlign: 'start' }}>
                      {new Date(trip.departure).toLocaleTimeString(isRTL ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                      {' → '}
                      {new Date(trip.arrival).toLocaleTimeString(isRTL ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[#5B6B84]">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-4" /> {durationOf(trip.departure, trip.arrival, lang)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{trip.bus.name}</span>
                      <span aria-hidden="true">·</span>
                      <span className={cn('inline-flex items-center gap-1 font-bold tabular-nums', soldOut ? 'text-red-600' : 'text-emerald-600')}>
                        <Users className="size-4" />
                        {soldOut ? t('v2.soldOut') : `${left} ${t('v2.seatsLeft')}`}
                      </span>
                    </p>
                    <p className="mt-4 text-[22px] font-extrabold tabular-nums text-[#0B1B33]">
                      EGP {trip.price}
                      <span className="ms-1.5 text-[13px] font-medium text-[#5B6B84]">{t('v2.perPassenger')}</span>
                    </p>
                    <Link
                      href={soldOut ? '/trips' : `/trips/${trip.id}`}
                      aria-disabled={soldOut}
                      className={cn(
                        'mt-4 w-full rounded-xl py-3.5 text-center text-[14.5px] font-bold transition',
                        soldOut ? 'pointer-events-none bg-slate-100 text-slate-400' : 'bg-[#EFF4FF] text-[#1D5BD8] hover:bg-[#1D5BD8] hover:text-white'
                      )}
                    >
                      {t('v2.selectTrip')} →
                    </Link>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {/* ── B2B ── */}
      <section id="b2b" className="scroll-mt-20 bg-[#F6F8FC] py-16 md:py-24">
        <div className="v2-container grid items-center gap-12 lg:grid-cols-[400px_1fr_300px]">
          <motion.div
            initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <p className="text-[12px] font-bold tracking-[0.2em] text-[#1D5BD8]">{t('v2.b2bEyebrow')}</p>
            <h2 className="mt-3 text-balance text-[28px] font-extrabold leading-tight text-[#0B1B33] md:text-[36px]">{t('v2.b2bTitle')}</h2>
            <p className="mt-4 text-pretty text-[15.5px] leading-relaxed text-[#5B6B84] md:text-[16.5px]">{t('v2.b2bSub')}</p>
            <ul className="mt-6 grid gap-3.5">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-[15px] font-semibold text-[#0B1B33]">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#0A1E3C] text-white">
                    <Check className="size-3.5" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
            <Link href="/register/company" className="v2-btn-dark mt-7 inline-flex items-center gap-2 px-6 py-4 text-[15px]">
              {t('v2.b2bCta')} <ArrowRight className="size-4 v2-flip-rtl" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.2, ease: 'easeOut', delay: 0.1 }}
            className="relative hidden overflow-hidden rounded-2xl lg:block"
          >
            <div className="relative aspect-[16/10] w-full">
              <Image src="/v2/bus.jpg" alt="" fill sizes="50vw" className="object-cover" />
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.2, ease: 'easeOut', delay: 0.15 }}
            className="rounded-2xl border border-[#E6EBF2] bg-white p-7 shadow-[0_12px_32px_rgba(11,27,51,0.08)]"
          >
            <span className="grid size-12 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8]">
              <LayoutDashboard className="size-6" />
            </span>
            <p className="mt-5 text-balance text-[17px] font-extrabold leading-snug text-[#0B1B33]">
              {isRTL ? 'أدر أسطولك وفريقك من لوحة واحدة.' : 'Manage your fleet and team from one dashboard.'}
            </p>
            <p className="mt-2.5 text-pretty text-[14px] leading-relaxed text-[#5B6B84]">
              {isRTL ? 'تحديثات لحظية وتقارير مفصلة وتحكم كامل — مصمم للشركات.' : 'Real-time updates, detailed reports, and complete control — built for businesses.'}
            </p>
            <Link href="/register/company" className="v2-btn-dark mt-6 flex items-center justify-center gap-2 px-4 py-3.5 text-[14.5px]">
              {t('v2.requestBus')} <ArrowRight className="size-4 v2-flip-rtl" />
            </Link>
          </motion.aside>
        </div>
      </section>

      <V2SiteFooter />
    </div>
  );
}
