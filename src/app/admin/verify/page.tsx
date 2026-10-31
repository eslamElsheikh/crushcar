'use client';

import { routeLabel } from '@/lib/route-label';
import { useState } from 'react';
import { ScanEye, Search, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader } from '@/components/v2/admin';
import { V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge } from '@/components/v2/ui';
import { bookingStatusLabel, bookingStatusTone } from '@/lib/booking-status';

interface VerifyBooking {
  id: string;
  reference: string;
  type: 'customer' | 'company';
  passengerName: string;
  maskedPhone: string;
  seatLabel: string;
  status: string;
  boarded: boolean;
  boardedAt: string | null;
  route: {
    origin: string;
    destination: string;
    departure: string;
  };
  isUpcoming: boolean;
}

export default function VerifyPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [boardingId, setBoardingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [upcomingBookings, setUpcomingBookings] = useState<VerifyBooking[]>([]);
  const [olderBookings, setOlderBookings] = useState<VerifyBooking[]>([]);
  const [showOlder, setShowOlder] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError('');
    setUpcomingBookings([]);
    setOlderBookings([]);
    setSearched(true);

    try {
      // 1. Try phone lookup endpoint first
      const lookupRes = await fetch(`/api/admin/verify/lookup?phone=${encodeURIComponent(q)}`, {
        credentials: 'include',
      });

      if (lookupRes.ok) {
        const data = await lookupRes.json();
        if (data.total > 0) {
          setUpcomingBookings(data.upcoming || []);
          setOlderBookings(data.older || []);
          return;
        }
      }

      // 2. Fallback: try direct reference lookup
      const refRes = await fetch(`/api/bookings/${encodeURIComponent(q)}`, {
        credentials: 'include',
      });

      if (refRes.ok) {
        const b = await refRes.json();
        const item: VerifyBooking = {
          id: b.id,
          reference: b.reference,
          type: b.companyId ? 'company' : 'customer',
          passengerName: b.passengerName,
          maskedPhone: b.passengerPhone ? `${b.passengerPhone.slice(0, 3)}****${b.passengerPhone.slice(-4)}` : '***',
          seatLabel: b.seatLabel,
          status: b.status,
          boarded: b.status === 'BOARDED' || !!b.boarded || !!b.boardedAt,
          boardedAt: b.boardedAt || null,
          route: {
            origin: b.actualOrigin || b.trip?.origin || '',
            destination: b.actualDestination || b.trip?.destination || '',
            departure: b.actualDeparture || b.trip?.departure || new Date().toISOString(),
          },
          isUpcoming: new Date(b.actualDeparture || b.trip?.departure || 0).getTime() >= new Date().setHours(0, 0, 0, 0),
        };
        if (item.isUpcoming) {
          setUpcomingBookings([item]);
        } else {
          setOlderBookings([item]);
        }
        return;
      }

      setError(isRTL ? 'لم يتم العثور على أي حجز مطابق' : 'No matching bookings found');
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  async function board(booking: VerifyBooking) {
    setBoardingId(booking.id);
    try {
      const url = booking.type === 'company'
        ? `/api/admin/company-bookings/${booking.id}`
        : `/api/bookings/${booking.id}`;

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'BOARD', status: 'BOARDED' }),
      });

      if (res.ok) {
        const updateList = (list: VerifyBooking[]) =>
          list.map((b) => (b.id === booking.id ? { ...b, status: 'BOARDED', boarded: true, boardedAt: new Date().toISOString() } : b));
        setUpcomingBookings(updateList);
        setOlderBookings(updateList);
        toast.success(isRTL ? 'تم تسجيل صعود المسافر بنجاح' : 'Passenger boarding confirmed');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || data.error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBoardingId(null);
    }
  }

  function renderBookingCard(b: VerifyBooking) {
    const isDone = b.boarded || b.status === 'BOARDED';
    const canBoard = !isDone && b.status !== 'CANCELLED';

    return (
      <div key={b.id} className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <V2StatusBadge tone={bookingStatusTone(b.status)}>
              {bookingStatusLabel(t, b.status)}
            </V2StatusBadge>
            {b.type === 'company' && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                {isRTL ? 'حجز شركة' : 'Company'}
              </span>
            )}
          </div>
          <span className="font-mono text-[12.5px] tabular-nums text-[var(--sp-text-muted)]" dir="ltr">
            {b.reference}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[17px] font-extrabold text-[#0B1B33]">{b.passengerName}</p>
          <p className="font-mono text-[13px] text-[var(--sp-text-muted)]" dir="ltr">
            {b.maskedPhone}
          </p>
        </div>

        <div className="mt-2 text-[14.5px]">
          <p className="font-bold text-[#0B1B33]">
            {routeLabel(b.route.origin, b.route.destination, isRTL)}
          </p>
          <p className="mt-0.5 text-[13px] tabular-nums text-[var(--sp-text-muted)]">
            {isRTL ? 'مقعد' : 'Seat'} <span className="font-bold text-[#0B1B33]">{b.seatLabel}</span>
            {b.route.departure && ` · ${new Date(b.route.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>

        <div className="mt-4">
          {isDone ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13.5px] font-bold text-emerald-800">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              <span>{isRTL ? 'المسافر صعد الباص بالفعل' : 'Passenger already boarded'}</span>
            </div>
          ) : canBoard ? (
            <V2Button
              disabled={boardingId === b.id}
              onClick={() => board(b)}
              size="md"
              className="w-full"
            >
              {boardingId === b.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserCheck className="size-4" />
              )}
              {isRTL ? 'تأكيد الصعود إلى الباص' : 'Confirm Boarding'}
            </V2Button>
          ) : (
            <div className="text-[13px] font-semibold text-rose-600">
              {isRTL ? 'الحجز ملغي ولا يمكن الصعود' : 'Booking is cancelled'}
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalResults = upcomingBookings.length + olderBookings.length;

  return (
    <div className="mx-auto max-w-2xl">
      <V2PageHeader
        title={t('nav.verify')}
        sub={isRTL ? 'ابحث برقم الهاتف أو رقم الحجز لعرض التذاكر والتحقق من الصعود' : 'Search by phone number or booking reference to verify boarding'}
      />

      <form onSubmit={search} className="mt-5 flex gap-2">
        <span className="relative block flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
          <V2Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isRTL ? 'رقم الهاتف (مثل: 010...) أو رقم الحجز...' : 'Phone number (e.g. 010...) or reference...'}
            aria-label={isRTL ? 'بحث' : 'Search'}
            dir="ltr"
            className="pl-11 text-start rtl:text-end font-mono"
          />
        </span>
        <V2Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="size-5 animate-spin" /> : <ScanEye className="size-5" />}
          {isRTL ? 'بحث' : 'Search'}
        </V2Button>
      </form>

      {error && !totalResults && (
        <p role="alert" className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-[14.5px] font-semibold text-red-600">
          <XCircle className="size-5 shrink-0" /> {error}
        </p>
      )}

      {searched && totalResults === 0 && !loading && !error && (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-[14px] text-[var(--sp-text-muted)]">
          {isRTL ? 'لم يتم العثور على أي حجز مسجل لهذا الرقم' : 'No bookings registered under this phone number'}
        </div>
      )}

      {/* Upcoming / Today's Bookings */}
      {upcomingBookings.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-[#0B1B33]">
              {isRTL ? 'رحلات اليوم والقادمة' : 'Upcoming & Today\'s Trips'}
              <span className="ms-2 rounded-full bg-blue-50 px-2 py-0.5 text-[12px] font-bold text-[#1D5BD8]">
                {upcomingBookings.length}
              </span>
            </h3>
          </div>
          <div className="grid gap-3">
            {upcomingBookings.map(renderBookingCard)}
          </div>
        </div>
      )}

      {/* Older Bookings (Collapsible) */}
      {olderBookings.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowOlder(!showOlder)}
            className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-[14px] font-bold text-[#0B1B33] hover:bg-slate-100"
          >
            <span>
              {isRTL ? 'الحجوزات والرحلات السابقة' : 'Past & Older Bookings'} ({olderBookings.length})
            </span>
            {showOlder ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          {showOlder && (
            <div className="mt-3 grid gap-3">
              {olderBookings.map(renderBookingCard)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
