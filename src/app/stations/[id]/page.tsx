'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { MapPin, Bus, Clock, ArrowRight } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2StatusBadge, V2Skeleton, V2EmptyState } from '@/components/v2/ui';

/* V2 station detail — same /api/stations/[id]/trips data as V1. */

interface Trip {
  id: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  price: number;
  bus: { name: string };
  availableSeats: number;
  routeStops: { name: string; order: number }[];
}

export default function StationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const stationId = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [station, setStation] = useState<{ name: string; city: string } | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/stations/${stationId}/trips`);
        if (res.ok) {
          const data = await res.json();
          setStation(data.station);
          setTrips(data.trips || []);
        } else {
          router.push('/stations');
        }
      } catch { /* keep loading off */ } finally { setLoading(false); }
    })();
  }, [stationId, router]);

  return (
    <div className="v2 min-h-dvh bg-[var(--sp-bg)]" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container max-w-4xl pb-16 pt-8 md:pt-10">
        <Link href="/stations" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--sp-text-muted)] hover:text-[#0B1B33]">
          <ArrowRight className="size-4 rotate-180 v2-flip-rtl" /> {t('stations.pageTitle')}
        </Link>

        {loading ? (
          <div className="mt-5 grid gap-3" role="status">
            <V2Skeleton className="h-10 w-64" />
            <V2Skeleton className="h-28 rounded-2xl" />
            <V2Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-3.5">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#1D5BD8] text-white">
                <MapPin className="size-7" />
              </span>
              <div>
                <h1 className="text-balance text-[26px] font-extrabold text-[#0B1B33]">{station?.name}</h1>
                <p className="text-[14.5px] tabular-nums text-[var(--sp-text-muted)]">
                  {station?.city} · {trips.length} {t('stations.tripsCount')}
                </p>
              </div>
            </div>

            <div className="mt-6">
              {trips.length === 0 ? (
                <V2EmptyState title={t('stations.noTripsFrom')} actionLabel={t('v2.browseTrips')} onAction={() => router.push('/trips')} />
              ) : (
                <div className="grid gap-3.5">
                  {trips.map((tr) => (
                    <Link key={tr.id} href={`/trips/${tr.id}`} className="v2-card v2-hover-lift block p-5 md:p-6">
                      <p className="text-balance text-[17px] font-extrabold text-[#0B1B33]">
                        {isRTL ? `${tr.destination} ← ${tr.origin}` : `${tr.origin} → ${tr.destination}`}
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] tabular-nums text-[var(--sp-text-muted)]">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="size-4" />
                          {new Date(tr.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                          {' · '}
                          {new Date(tr.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="inline-flex items-center gap-1.5"><Bus className="size-4" /> {tr.bus?.name}</span>
                        <V2StatusBadge tone={tr.availableSeats > 0 ? 'green' : 'red'}>
                          {tr.availableSeats > 0 ? `${tr.availableSeats} ${t('v2.seatsLeft')}` : t('v2.soldOut')}
                        </V2StatusBadge>
                        <span className="ms-auto text-[17px] font-extrabold text-[#0B1B33]">{tr.price.toLocaleString(locale)} {t('common.currency')}</span>
                      </p>
                      {(tr.routeStops?.length || 0) > 0 && (
                        <p className="mt-1.5 truncate text-[13px] text-[var(--sp-text-muted)]">
                          {tr.routeStops.map((s) => s.name).join(isRTL ? ' ← ' : ' → ')}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <V2SiteFooter />
    </div>
  );
}
