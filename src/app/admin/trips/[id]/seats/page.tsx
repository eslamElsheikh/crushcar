'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, Armchair, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader } from '@/components/v2/admin';
import { V2Skeleton } from '@/components/v2/ui';

/* V2 per-trip seat ops — same trip fetch + BOARDED endpoints as V1. */

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export default function TripSeatsPage() {
  const params = useParams();
  const tripId = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [boarding, setBoarding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}`, { credentials: 'include' });
      if (res.ok) setTrip(await res.json());
    } catch { /* keep view */ } finally { setLoading(false); }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  async function markBoarded(bookingId: string, isCompany: boolean) {
    setBoarding(bookingId);
    try {
      const url = isCompany ? `/api/company/bookings/${bookingId}` : `/api/bookings/${bookingId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'BOARDED' }),
      });
      if (res.ok) {
        setTrip((prev: any) => {
          if (!prev) return prev;
          const mark = (list: any[]) => (list || []).map((b) => (b.id === bookingId ? { ...b, status: 'BOARDED', boarded: true, boardedAt: new Date().toISOString() } : b));
          return { ...prev, bookings: mark(prev.bookings), companyBookings: mark(prev.companyBookings) };
        });
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBoarding(null);
    }
  }

  const layout = trip?.bus?.layout;
  const booked = new Map<string, any>();
  [...(trip?.bookings || []), ...(trip?.companyBookings || [])].forEach((b: any) => {
    if (b.status !== 'CANCELLED') booked.set(b.seatLabel, b);
  });
  const companyIds = new Set((trip?.companyBookings || []).map((b: any) => b.id));
  const aislePos = layout?.aisleAfter ?? 2;

  function rowCount(rowLetter: string): number {
    if (layout?.colsPerRow) {
      try {
        return JSON.parse(layout.colsPerRow)[rowLetter] || 4;
      } catch { return 4; }
    }
    return layout?.cols || 4;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/trips" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#5B6B84] hover:text-[#0B1B33]">
        <ArrowRight className="size-4 rotate-180 v2-flip-rtl" /> {t('nav.trips')}
      </Link>
      <div className="mt-3">
        <V2PageHeader
          title={trip ? (isRTL ? `${trip.destination} ← ${trip.origin}` : `${trip.origin} → ${trip.destination}`) : t('nav.seats')}
          sub={trip ? `${trip.bus?.name} · ${booked.size}/${layout?.seats?.length || 0}` : undefined}
        />
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3" role="status">
          <V2Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-[#E6EBF2] bg-white p-5 md:p-8">
          <div className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-[#F6F8FC] py-3">
            <span className="text-base" aria-hidden="true">🚍</span>
            <span className="text-[12px] font-bold text-[#5B6B84]">{isRTL ? 'مقدمة الباص' : 'FRONT OF BUS'}</span>
          </div>
          <div className="grid gap-2">
            {Array.from({ length: layout?.rows || 10 }, (_, rowIdx) => {
              const letter = ROWS[rowIdx];
              const count = rowCount(letter);
              return (
                <div key={rowIdx} className="flex items-center justify-center gap-2">
                  <span className="w-6 shrink-0 text-center text-[12px] font-bold tabular-nums text-[#9AA8BD]">{letter}</span>
                  {Array.from({ length: count }, (_, colIdx) => {
                    const col = colIdx + 1;
                    const seat = layout?.seats?.find((s: any) => s.row === rowIdx && s.col === col);
                    const isAisle = col === aislePos + 1 && count > 3;
                    if (!seat) return <span key={colIdx} className={cn('size-12 shrink-0', isAisle && 'ms-6')} />;
                    const b = booked.get(seat.label);
                    const boarded = b && (b.boarded || b.status === 'BOARDED');
                    return (
                      <button
                        key={colIdx}
                        disabled={!b || boarded || boarding === b?.id}
                        onClick={() => b && markBoarded(b.id, companyIds.has(b.id))}
                        title={b ? `${seat.label} · ${b.passengerName || ''}` : `${seat.label} · ${isRTL ? 'فارغ' : 'Empty'}`}
                        className={cn(
                          'grid size-12 shrink-0 place-items-center rounded-xl border-2 transition',
                          isAisle && 'ms-6',
                          !b && 'border-slate-200 bg-white text-slate-300',
                          b && !boarded && 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-500',
                          b && boarded && 'cursor-default border-emerald-300 bg-emerald-50 text-emerald-700'
                        )}
                      >
                        {boarding === b?.id ? (
                          <Loader2 className="size-5 animate-spin" />
                        ) : (
                          <span className="text-center">
                            <Armchair className="mx-auto size-4" />
                            <span className="block max-w-[40px] truncate text-[9px] font-bold leading-tight">
                              {b ? (b.passengerName || '').split(' ')[0] : seat.label}
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold text-[#5B6B84]">
            <span className="flex items-center gap-1.5"><span className="size-4 rounded-md border-2 border-slate-200 bg-white" /> {isRTL ? 'فارغ' : 'Empty'}</span>
            <span className="flex items-center gap-1.5"><span className="size-4 rounded-md border-2 border-amber-300 bg-amber-50" /> {isRTL ? 'محجوز — اضغط للترحيل' : 'Booked — tap to board'}</span>
            <span className="flex items-center gap-1.5"><span className="size-4 rounded-md border-2 border-emerald-300 bg-emerald-50" /> {t('booking.boarded')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
