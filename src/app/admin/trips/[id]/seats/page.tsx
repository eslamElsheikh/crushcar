'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, Armchair, Bus, Loader2, CheckCircle2, Clock, User, Building2, Hash, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Modal } from '@/components/v2/admin';
import { V2Skeleton, V2StatusBadge } from '@/components/v2/ui';
import { V2Button } from '@/components/v2/Button';

/* V2 per-trip seat ops — same trip fetch + BOARDED endpoints + seat detail inspection as V1. */

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export default function TripSeatsPage() {
  const params = useParams();
  const tripId = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [boarding, setBoarding] = useState<string | null>(null);
  const [inspectSeat, setInspectSeat] = useState<any>(null);

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
        if (inspectSeat?.booking?.id === bookingId) {
          setInspectSeat((prev: any) => ({
            ...prev,
            booking: { ...prev.booking, status: 'BOARDED', boarded: true, boardedAt: new Date().toISOString() }
          }));
        }
        toast.success(isRTL ? 'تم تأكيد الصعود بنجاح' : 'Boarding confirmed');
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
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/trips" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--sp-text-muted)] hover:text-[#0B1B33]">
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
        <div className="mt-5 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-8">
          <div className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-[var(--sp-inset)] py-3">
            <Bus className="size-5 text-[#1D5BD8]" aria-hidden="true" />
            <span className="text-[12px] font-bold text-[var(--sp-text-muted)]">{isRTL ? 'مقدمة الباص' : 'FRONT OF BUS'}</span>
          </div>
          <div className="grid gap-2 overflow-x-auto pb-2">
            {Array.from({ length: layout?.rows || 10 }, (_, rowIdx) => {
              const letter = ROWS[rowIdx];
              const count = rowCount(letter);
              return (
                <div key={rowIdx} className="flex min-w-fit items-center justify-center gap-2">
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
                        type="button"
                        onClick={() => setInspectSeat({ seat, booking: b })}
                        title={b ? `${seat.label} · ${b.passengerName || ''}` : `${seat.label} · ${isRTL ? 'فارغ' : 'Empty'}`}
                        className={cn(
                          'grid size-12 shrink-0 place-items-center rounded-xl border-2 transition',
                          isAisle && 'ms-6',
                          !b && 'border-slate-200 bg-[var(--sp-card)] text-slate-300 hover:border-slate-300 hover:bg-slate-50',
                          b && !boarded && 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-500 hover:shadow-sm',
                          b && boarded && 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400'
                        )}
                      >
                        <span className="text-center">
                          <Armchair className="mx-auto size-4" />
                          <span className="block max-w-[40px] truncate text-[9px] font-bold leading-tight">
                            {b ? (b.passengerName || '').split(' ')[0] : seat.label}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold text-[var(--sp-text-muted)]">
            <span className="flex items-center gap-1.5"><span className="size-4 rounded-md border-2 border-slate-200 bg-[var(--sp-card)]" /> {isRTL ? 'فارغ' : 'Empty'}</span>
            <span className="flex items-center gap-1.5"><span className="size-4 rounded-md border-2 border-amber-300 bg-amber-50" /> {isRTL ? 'محجوز' : 'Booked'}</span>
            <span className="flex items-center gap-1.5"><span className="size-4 rounded-md border-2 border-emerald-300 bg-emerald-50" /> {t('booking.boarded')}</span>
          </div>
        </div>
      )}

      {/* Seat Details Modal / Inspection Drawer (Restored from V1) */}
      <V2Modal
        open={!!inspectSeat}
        onClose={() => setInspectSeat(null)}
        title={inspectSeat ? `${isRTL ? 'مقعد' : 'Seat'} ${inspectSeat.seat?.label}` : ''}
      >
        {inspectSeat && (
          <div className="grid gap-4">
            {!inspectSeat.booking ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-[var(--sp-inset)] p-6 text-center">
                <Armchair className="mx-auto size-8 text-slate-400" />
                <p className="mt-2 text-[15px] font-extrabold text-[#0B1B33]">
                  {isRTL ? 'المقعد متاح' : 'Seat Available'}
                </p>
                <p className="mt-1 text-[13px] text-[var(--sp-text-muted)]">
                  {isRTL ? 'لم يتم حجز هذا المقعد بعد' : 'Not booked for this trip'}
                </p>
                <p className="mt-3 text-[14.5px] font-extrabold text-[#1D5BD8]">
                  EGP {Number(inspectSeat.seat?.price || trip?.price || 0).toLocaleString(locale)}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="flex items-center justify-between rounded-xl bg-[var(--sp-inset)] p-3.5">
                  <span className="text-[13px] font-bold text-[var(--sp-text-muted)]">{t('tripRequest.status')}</span>
                  <V2StatusBadge tone={inspectSeat.booking.status === 'BOARDED' || inspectSeat.booking.status === 'PAID' ? 'green' : 'amber'}>
                    {inspectSeat.booking.status}
                  </V2StatusBadge>
                </div>

                <div className="rounded-xl border border-[var(--sp-line)] p-4 text-[13.5px]">
                  <div className="flex items-center gap-2 font-bold text-[#0B1B33]">
                    <User className="size-4 text-[#1D5BD8]" />
                    <span>{inspectSeat.booking.passengerName || inspectSeat.booking.user?.name || t('common.guest')}</span>
                  </div>
                  {inspectSeat.booking.passengerPhone && (
                    <p className="mt-1 text-[var(--sp-text-muted)] tabular-nums" dir="ltr">{inspectSeat.booking.passengerPhone}</p>
                  )}
                  {inspectSeat.booking.company?.name && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--sp-text-muted)]">
                      <Building2 className="size-3.5 text-[#1D5BD8]" />
                      <span>{inspectSeat.booking.company.name}</span>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[13px]">
                  <div className="rounded-xl bg-[var(--sp-inset)] p-3">
                    <span className="block text-[var(--sp-text-muted)]">{isRTL ? 'كود الحجز' : 'Ref'}</span>
                    <span className="font-mono font-bold text-[#0B1B33]" dir="ltr">{inspectSeat.booking.reference}</span>
                  </div>
                  <div className="rounded-xl bg-[var(--sp-inset)] p-3">
                    <span className="block text-[var(--sp-text-muted)]">{isRTL ? 'السعر' : 'Price'}</span>
                    <span className="font-bold text-[#0B1B33] tabular-nums">
                      EGP {Number(inspectSeat.booking.total || 0).toLocaleString(locale)}
                    </span>
                  </div>
                </div>

                {inspectSeat.booking.paidAt && (
                  <p className="text-[12px] text-[var(--sp-text-muted)]">
                    {isRTL ? 'وقت الدفع' : 'Paid at'}: {new Date(inspectSeat.booking.paidAt).toLocaleString(locale)}
                  </p>
                )}

                {inspectSeat.booking.status !== 'BOARDED' && (
                  <div className="mt-2">
                    <V2Button
                      disabled={boarding === inspectSeat.booking.id}
                      onClick={() => markBoarded(inspectSeat.booking.id, companyIds.has(inspectSeat.booking.id))}
                      className="w-full"
                    >
                      {boarding === inspectSeat.booking.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      {isRTL ? 'تأكيد الصعود للباص' : 'Confirm Boarding'}
                    </V2Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </V2Modal>
    </div>
  );
}
