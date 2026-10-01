'use client';

import { useState } from 'react';
import { ScanEye, Search, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader } from '@/components/v2/admin';
import { V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge } from '@/components/v2/ui';

/* V2 ticket verification — same lookup + BOARDED flow as V1. */

export default function VerifyPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [query, setQuery] = useState('');
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [boarding, setBoarding] = useState(false);
  const [error, setError] = useState('');

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setBooking(null);
    try {
      let res = await fetch(`/api/bookings/${query.trim()}`, { credentials: 'include' });
      if (!res.ok) {
        const listRes = await fetch(`/api/bookings?search=${encodeURIComponent(query.trim())}`, { credentials: 'include' });
        if (listRes.ok) {
          const data = await listRes.json();
          const first = (data.data || [])[0];
          if (first) res = await fetch(`/api/bookings/${first.id}`, { credentials: 'include' });
        }
      }
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'CANCELLED') {
          setError(isRTL ? 'هذا الحجز ملغي' : 'This booking is cancelled');
        } else if (data.status === 'BOARDED' || data.boarded) {
          setError(isRTL ? 'المسافر بالفعل صعد الباص' : 'Passenger already boarded');
          setBooking(data);
        } else {
          setBooking(data);
        }
      } else if (res.status === 404) {
        setError(isRTL ? 'لم يتم العثور على الحجز' : 'Booking not found');
      } else {
        setError(t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  async function board() {
    if (!booking) return;
    setBoarding(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'BOARDED' }),
      });
      if (res.ok) {
        setBooking({ ...booking, status: 'BOARDED', boarded: true });
        toast.success(t('common.success'));
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBoarding(false);
    }
  }

  const done = booking && (booking.status === 'BOARDED' || booking.boarded);

  return (
    <div className="mx-auto max-w-2xl">
      <V2PageHeader
        title={t('nav.verify')}
        sub={isRTL ? 'ابحث برقم الحجز أو الهاتف للتحقق من صعود المسافر' : 'Search by booking reference or phone to verify passenger boarding'}
      />

      <form onSubmit={search} className="mt-5 flex gap-2">
        <span className="relative block flex-1">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
          <V2Input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={isRTL ? 'رقم الحجز أو الهاتف...' : 'Reference or phone...'}
            aria-label={isRTL ? 'بحث' : 'Search'}
            dir="ltr" className="ps-11 font-mono"
          />
        </span>
        <V2Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="size-5 animate-spin" /> : <ScanEye className="size-5" />}
          {isRTL ? 'تحقق' : 'Verify'}
        </V2Button>
      </form>

      {error && !booking && (
        <p role="alert" className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-[14.5px] font-semibold text-red-600">
          <XCircle className="size-5 shrink-0" /> {error}
        </p>
      )}

      {booking && (
        <div className="mt-4 rounded-2xl border border-[#E6EBF2] bg-white p-6">
          <div className="flex flex-wrap items-center gap-2">
            <V2StatusBadge tone={booking.status === 'CANCELLED' ? 'red' : done ? 'green' : 'blue'}>
              {booking.status}
            </V2StatusBadge>
            <span className="ms-auto font-mono text-[12.5px] tabular-nums text-[#5B6B84]" dir="ltr">{booking.reference}</span>
          </div>
          <p className="mt-3.5 text-[20px] font-extrabold text-[#0B1B33]">{booking.passengerName}</p>
          <p className="mt-1 text-[14px] tabular-nums text-[#5B6B84]" dir="ltr" style={{ textAlign: 'start' }}>{booking.passengerPhone}</p>
          <p className="mt-2 text-[15px] font-bold text-[#0B1B33]">
            {isRTL
              ? `${booking.actualDestination || booking.trip?.destination} ← ${booking.actualOrigin || booking.trip?.origin}`
              : `${booking.actualOrigin || booking.trip?.origin} → ${booking.actualDestination || booking.trip?.destination}`}
          </p>
          <p className="mt-1 text-[13.5px] tabular-nums text-[#5B6B84]">
            {isRTL ? 'مقعد' : 'Seat'} {booking.seatLabel}
            {(booking.actualDeparture || booking.trip?.departure) && ` · ${new Date(booking.actualDeparture || booking.trip.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-[13.5px] font-semibold text-amber-700">{error}</p>
          )}
          {!done && booking.status !== 'CANCELLED' && (
            <V2Button size="lg" disabled={boarding} onClick={board} className="mt-5 w-full">
              {boarding ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
              {t('booking.boarded')}
            </V2Button>
          )}
        </div>
      )}
    </div>
  );
}
