'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, ArrowRight, Bus } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2Input } from '@/components/v2/Field';
import { V2Skeleton, V2NoResults } from '@/components/v2/ui';

/* V2 stations — same /api/stations search + per-station trips preview as V1. */

interface TripPreview { id: string; destination?: string; origin?: string; departure: string; price: number; bus?: { name: string } }
interface Station { id: string; name: string; city: string; address?: string }

export default function StationsPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [preview, setPreview] = useState<Record<string, TripPreview[]>>({});

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const q = new URLSearchParams();
        if (query) q.set('q', query);
        if (city) q.set('city', city);
        const res = await fetch(`/api/stations?${q}`);
        if (res.ok) {
          const data = await res.json();
          setStations(data.stations || []);
        }
      } catch { /* keep list */ } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, city]);

  async function loadPreview(s: Station) {
    if (preview[s.id]) return;
    try {
      const res = await fetch(`/api/stations/${s.id}/trips`);
      if (res.ok) {
        const data = await res.json();
        const trips: TripPreview[] = Array.isArray(data) ? data : data.trips || data.data || [];
        setPreview((p) => ({ ...p, [s.id]: trips.slice(0, 3) }));
      }
    } catch { /* no preview */ }
  }

  return (
    <div className="v2 min-h-dvh bg-[var(--sp-bg)]" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container max-w-4xl pb-16 pt-8 md:pt-10">
        <h1 className="text-balance text-[28px] font-extrabold text-[#0B1B33] md:text-[36px]">{t('stations.pageTitle')}</h1>
        <p className="mt-2 text-pretty text-[15px] text-[var(--sp-text-muted)]">{t('stations.pageDesc')}</p>

        <div className="v2-card mt-6 grid gap-3 p-4 sm:grid-cols-[1fr_200px] md:p-5">
          <span className="relative block">
            <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
            <V2Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('stations.searchPlaceholder')} aria-label={t('stations.searchPlaceholder')} className="ps-11" />
          </span>
          <V2Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('stations.filterByCity')} aria-label={t('stations.filterByCity')} />
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="grid gap-3" role="status">
              <V2Skeleton className="h-28 rounded-2xl" />
              <V2Skeleton className="h-28 rounded-2xl" />
              <V2Skeleton className="h-28 rounded-2xl" />
            </div>
          ) : stations.length === 0 ? (
            <V2NoResults title={t('stations.noStations')} actionLabel={t('v2.clearFilters')} onAction={() => { setQuery(''); setCity(''); }} />
          ) : (
            <div className="grid gap-3.5">
              {stations.map((s) => (
                <div key={s.id} className="v2-card p-5 md:p-6" onMouseEnter={() => loadPreview(s)}>
                  <div className="flex items-center gap-3.5">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#EFF4FF] text-[#1D5BD8]">
                      <MapPin className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16.5px] font-extrabold text-[#0B1B33]">{s.name}</p>
                      <p className="mt-0.5 text-[13.5px] text-[var(--sp-text-muted)]">{s.city}{s.address ? ` · ${s.address}` : ''}</p>
                    </div>
                    <Link href={`/stations/${s.id}`} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#EFF4FF] text-[#1D5BD8] hover:bg-[#1D5BD8] hover:text-white" aria-label={s.name}>
                      <ArrowRight className="size-5 v2-flip-rtl" />
                    </Link>
                  </div>
                  {(preview[s.id]?.length || 0) > 0 && (
                    <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4">
                      {preview[s.id].map((tr) => (
                        <Link key={tr.id} href={`/trips/${tr.id}`} className="flex items-center gap-2.5 rounded-xl bg-[var(--sp-inset)] px-4 py-3 text-[13.5px] hover:bg-[#EFF4FF]">
                          <Bus className="size-4 shrink-0 text-[#1D5BD8]" />
                          <span className="min-w-0 flex-1 truncate font-semibold text-[#0B1B33]">
                            {tr.origin || ''} {tr.destination ? (isRTL ? '←' : '→') : ''} {tr.destination || ''}
                          </span>
                          <span className="shrink-0 tabular-nums text-[var(--sp-text-muted)]">
                            {new Date(tr.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="shrink-0 font-extrabold tabular-nums text-[#0B1B33]">EGP {tr.price}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <V2SiteFooter />
    </div>
  );
}
