'use client';

import { useEffect, useState } from 'react';
import { Bus, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2SearchInput } from '@/components/v2/admin';
import { V2StatusBadge, V2Skeleton } from '@/components/v2/ui';

/* V2 seats dashboard — same trips + per-trip bookings data as V1. */

interface Trip {
  id: string;
  origin: string;
  destination: string;
  departure: string;
  bus: { id: string; name: string; seatCount: number };
}

export default function SeatsDashboardPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bookingsMap, setBookingsMap] = useState<Record<string, any[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/trips', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setTrips(Array.isArray(data) ? data : data.data || []);
        }
      } catch { /* keep empty */ } finally { setLoading(false); }
    })();
  }, []);

  async function toggle(tripId: string) {
    if (expanded === tripId) {
      setExpanded(null);
      return;
    }
    setExpanded(tripId);
    if (bookingsMap[tripId]) return;
    setLoadingMap((m) => ({ ...m, [tripId]: true }));
    try {
      const res = await fetch(`/api/trips/${tripId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const all = [...(data.bookings || []), ...(data.companyBookings || [])].filter(
          (b: any) => b.status !== 'CANCELLED'
        );
        setBookingsMap((m) => ({ ...m, [tripId]: all }));
      }
    } catch { /* keep empty */ } finally {
      setLoadingMap((m) => ({ ...m, [tripId]: false }));
    }
  }

  const visible = trips.filter((tr) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${tr.origin} ${tr.destination} ${tr.bus?.name}`.toLowerCase().includes(q);
  });

  return (
    <div>
      <V2PageHeader title={t('nav.seats')} sub={isRTL ? `${trips.length} رحلة` : `${trips.length} trips`} />

      <div className="mt-4 max-w-sm">
        <V2SearchInput value={search} onChange={setSearch} placeholder={t('bookings.search')} />
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-3" role="status">
            <V2Skeleton className="h-24 rounded-2xl" />
            <V2Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-[#E6EBF2] bg-white p-10 text-center">
            <p className="text-[15.5px] font-extrabold text-[#0B1B33]">{t('trips.noTrips')}</p>
            <a href="/admin/trips/new" className="v2-btn-ghost mt-4 inline-flex px-6 py-3 text-[14.5px]">
              {t('trips.addTrip')}
            </a>
          </div>
        ) : (
          <div className="grid gap-3">
            {visible.map((tr) => {
              const open = expanded === tr.id;
              const bookings = bookingsMap[tr.id] || [];
              const boarded = bookings.filter((b: any) => b.boarded || b.status === 'BOARDED').length;
              return (
                <div key={tr.id} className="overflow-hidden rounded-2xl border border-[#E6EBF2] bg-white">
                  <button onClick={() => toggle(tr.id)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-start md:p-5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8]">
                      <Bus className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-extrabold text-[#0B1B33]">
                        {isRTL ? `${tr.destination} ← ${tr.origin}` : `${tr.origin} → ${tr.destination}`}
                      </span>
                      <span className="block text-[12.5px] tabular-nums text-[#5B6B84]">
                        {new Date(tr.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                        {' · '}{tr.bus?.name}
                        {bookingsMap[tr.id] && ` · ${bookings.length}/${tr.bus?.seatCount || '?'} · ${boarded} ✓`}
                      </span>
                    </span>
                    <ChevronDown className={cn('size-5 shrink-0 text-[#5B6B84] transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && (
                    <div className="border-t border-slate-100 p-4">
                      {loadingMap[tr.id] ? (
                        <div className="grid gap-2" role="status">
                          <V2Skeleton className="h-12 rounded-xl" />
                          <V2Skeleton className="h-12 rounded-xl" />
                        </div>
                      ) : bookings.length === 0 ? (
                        <p className="py-4 text-center text-[13.5px] text-[#5B6B84]">{t('bookings.noBookings')}</p>
                      ) : (
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {bookings.map((b: any) => {
                            const done = b.boarded || b.status === 'BOARDED';
                            return (
                              <div key={b.id} className="flex items-center gap-2.5 rounded-xl bg-[#F6F8FC] px-3.5 py-2.5 text-[13.5px]">
                                <span className="rounded-lg bg-[#0A1E3C] px-2.5 py-1 font-bold tabular-nums text-white">{b.seatLabel}</span>
                                <span className="min-w-0 flex-1 truncate font-semibold text-[#0B1B33]">{b.passengerName}</span>
                                {done && (
                                  <V2StatusBadge tone="green">
                                    <Check className="size-3.5" />
                                  </V2StatusBadge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
