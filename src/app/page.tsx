'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  MapPin, CalendarDays, Users, ArrowLeftRight, Search, Building2, User,
  Zap, ShieldCheck, Leaf, ArrowRight, Clock, Star, Bus, Armchair,
  TicketCheck, Check, LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2SectionHeading } from '@/components/v2/ui';

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

const CITY_IMAGES: Record<string, string> = {
  cairo: '/v2/cairo.jpg',
  alexandria: '/v2/alexandria.jpg',
  hurghada: '/v2/hurghada.jpg',
  luxor: '/v2/luxor.jpg',
};

function cityImage(city: string): string {
  const key = city.toLowerCase();
  for (const [k, img] of Object.entries(CITY_IMAGES)) {
    if (key.includes(k)) return img;
  }
  return '/v2/city.jpg';
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
  const [mode, setMode] = useState<'b2c' | 'b2b'>('b2c');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    fetch('/api/stations').then((r) => r.json()).then((d) => {
      const list: Station[] = d.stations || d || [];
      if (Array.isArray(list)) setStations(list);
    }).catch(() => {});
    fetch('/api/public/stats').then((r) => r.json()).then((d) => {
      if (!d.error) setStats(d);
    }).catch(() => {});
  }, []);

  const cities = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of stations) {
      const city = (s.city || s.name || '').trim();
      if (city && !seen.has(city.toLowerCase())) seen.set(city.toLowerCase(), city);
    }
    const showcase = ['cairo', 'alexandria', 'hurghada', 'luxor'];
    const ordered = [
      ...showcase.flatMap((k) => {
        const found = [...seen.entries()].find(([low]) => low.includes(k));
        return found ? [found[1]] : [];
      }),
      ...[...seen.values()],
    ];
    return [...new Set(ordered)].slice(0, 4);
  }, [stations]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (fromId) params.set('fromStationId', fromId);
    if (toId) params.set('toStationId', toId);
    if (date) params.set('date', date);
    router.push(`/trips?${params.toString()}`);
  }

  const trust = [
    { icon: Zap, title: stats ? `${stats.activeTrips} ${isRTL ? 'رحلة نشطة' : 'active trips'}` : t('v2.trustRoutes'), sub: t('v2.trustRoutesSub') },
    { icon: MapPin, title: stations.length ? `${stations.length} ${isRTL ? 'محطة' : 'stations'}` : t('v2.trustStations'), sub: t('v2.trustStationsSub') },
    { icon: ShieldCheck, title: t('v2.trustSecure'), sub: t('v2.trustSecureSub') },
    { icon: Leaf, title: t('v2.trustGreen'), sub: t('v2.trustGreenSub') },
  ];

  const steps = [
    { icon: Search, title: t('v2.how1t'), desc: t('v2.how1d') },
    { icon: Bus, title: t('v2.how2t'), desc: t('v2.how2d') },
    { icon: Armchair, title: t('v2.how3t'), desc: t('v2.how3d') },
    { icon: TicketCheck, title: t('v2.how4t'), desc: t('v2.how4d') },
  ];

  const bullets = isRTL
    ? ['حجز باص كامل ورحلات جماعية', 'مسارات ومواعيد مخصصة', 'حساب مخصص للشركات', 'خيارات دفع مرنة']
    : ['Full bus charter & group bookings', 'Custom routes and schedules', 'Dedicated company account', 'Flexible payment options'];

  return (
    <div className="v2 min-h-dvh overflow-x-clip bg-white" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader overlay />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image src="/v2/hero.jpg" alt="" fill priority className="object-cover" />
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
              <div className="flex gap-1 rounded-xl bg-[#F1F4F9] p-1.5" role="tablist" aria-label="Trip type">
                {(
                  [
                    { key: 'b2c', icon: User, label: t('v2.individual') },
                    { key: 'b2b', icon: Building2, label: t('v2.business') },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key} role="tab" aria-selected={mode === tab.key} onClick={() => setMode(tab.key)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-[14.5px] font-bold transition',
                      mode === tab.key ? 'bg-[#0A1E3C] text-white shadow' : 'text-[#5B6B84]'
                    )}
                  >
                    <tab.icon className="size-5" /> {tab.label}
                  </button>
                ))}
              </div>

              {mode === 'b2c' ? (
                <form onSubmit={submitSearch} className="grid gap-3 p-2.5 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                  <label className="grid gap-2">
                    <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('v2.from')}</span>
                    <span className="relative">
                      <MapPin className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
                      <select value={fromId} onChange={(e) => setFromId(e.target.value)} aria-label={t('v2.from')} className="v2-input appearance-none ps-11">
                        <option value="">{t('v2.fromPh')}</option>
                        {stations.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <label className="grid gap-2">
                    <span className="flex items-center justify-between px-1 text-[13px] font-bold text-[#0B1B33]">
                      {t('v2.to')}
                      <button
                        type="button" aria-label="Swap origin and destination"
                        onClick={() => { setFromId(toId); setToId(fromId); }}
                        className="grid size-7 place-items-center rounded-full border border-slate-200 text-[#1D5BD8] hover:bg-slate-50"
                      >
                        <ArrowLeftRight className="size-4 v2-flip-rtl" />
                      </button>
                    </span>
                    <span className="relative">
                      <MapPin className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
                      <select value={toId} onChange={(e) => setToId(e.target.value)} aria-label={t('v2.to')} className="v2-input appearance-none ps-11">
                        <option value="">{t('v2.toPh')}</option>
                        {stations.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <label className="grid gap-2">
                    <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('v2.date')}</span>
                    <span className="relative">
                      <CalendarDays className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('v2.date')} className="v2-input ps-11 tabular-nums" />
                    </span>
                  </label>
                  <button type="submit" className="v2-btn-primary flex min-h-[52px] items-center justify-center gap-2 px-7 text-[15px] lg:min-h-[60px] lg:px-8">
                    <Search className="size-5 v2-flip-rtl" /> {t('v2.searchTrips')}
                  </button>
                </form>
              ) : (
                <div className="grid items-center gap-3 p-2.5 md:grid-cols-[1fr_auto]">
                  <p className="rounded-xl bg-[#EFF4FF] px-4 py-3.5 text-[14.5px] font-bold text-[#1D5BD8]">{t('v2.charter')}</p>
                  <Link href="/register/company" className="v2-btn-dark min-h-[52px] px-7 py-3.5 text-center text-[15px]">
                    {t('v2.requestBus')}
                  </Link>
                </div>
              )}
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

      {/* ── DESTINATIONS (cities proven by stations API) ── */}
      <section id="destinations" className="scroll-mt-20 bg-white py-16 md:py-20">
        <div className="v2-container">
          <V2SectionHeading
            title={t('v2.popularTitle')}
            sub={t('v2.popularSub')}
            action={
              <Link href="/trips" className="flex items-center gap-1.5 text-[14.5px] font-bold text-[#1D5BD8]">
                {t('v2.exploreAll')} <ArrowRight className="size-4 v2-flip-rtl" />
              </Link>
            }
          />
          <div className="v2-snap-row mt-8">
            {cities.map((city, i) => (
              <motion.div
                key={city}
                initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.2, ease: 'easeOut', delay: i * 0.06 }}
              >
                <Link href="/trips" className="v2-img-zoom v2-hover-lift group relative block overflow-hidden rounded-2xl">
                  <div className="relative aspect-[4/3] w-full bg-[#E6EBF2] lg:aspect-[3/3.4]">
                    <Image src={cityImage(city)} alt={city} fill sizes="(max-width:768px) 82vw, (max-width:1024px) 45vw, 22vw" className="object-cover" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B1B33]/90 via-[#0B1B33]/15 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                    <p className="text-balance text-[17px] font-bold leading-snug text-white">{city}</p>
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
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {steps.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.2, ease: 'easeOut', delay: i * 0.07 }}
                className="relative text-center"
              >
                <span className="absolute -top-1.5 start-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-[#1D5BD8] text-[12px] font-bold tabular-nums text-white rtl:translate-x-1/2">
                  {i + 1}
                </span>
                <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-white text-[#1D5BD8] shadow-[0_12px_32px_rgba(11,27,51,0.08)]">
                  <s.icon className="size-7" />
                </span>
                <p className="mt-4 text-balance text-[15.5px] font-extrabold text-[#0B1B33]">{s.title}</p>
                <p className="mx-auto mt-2 max-w-[220px] text-pretty text-[13.5px] leading-relaxed text-[#5B6B84]">{s.desc}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── FEATURED TRIPS (real: /api/public/stats recentTrips; hidden when none upcoming) ── */}
      {stats && stats.recentTrips.length > 0 && (
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
            {(stats?.recentTrips || []).map((trip, i) => {
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
                    <Image src={cityImage(trip.destination)} alt="" fill sizes="(max-width:768px) 82vw, 25vw" className="object-cover" />
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
