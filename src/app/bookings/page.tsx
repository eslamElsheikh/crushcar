'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { Copy, Check, Printer, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2EmptyState, V2Skeleton } from '@/components/v2/ui';

/* V2 my bookings — same list, tabs, cancel-with-policy flow as V1. */

interface Booking {
  id: string;
  reference: string;
  seatLabel: string;
  passengerName: string;
  status: string;
  total: number;
  paidAt: string | null;
  createdAt: string;
  actualOrigin?: string;
  actualDestination?: string;
  actualDeparture?: string;
  cancelledAt?: string | null;
  refundAmount?: number | null;
  cancellationFee?: number | null;
  trip: { id: string; origin: string; destination: string; departure: string; arrival: string; bus: { name: string } };
}

type Tab = 'upcoming' | 'pending' | 'past' | 'cancelled';

const toneFor = (s: string) =>
  s === 'PAID' ? 'green' : s === 'PENDING' ? 'amber' : s === 'CANCELLED' ? 'red' : 'blue';

export default function MyBookingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelInfo, setCancelInfo] = useState<{ refundAmount: number; cancellationFee: number; refundPercent: number; canCancel: boolean } | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const res = await fetch('/api/bookings', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setBookings(Array.isArray(data) ? data : data.data || []);
        }
      } catch { /* keep empty */ } finally { setLoading(false); }
    })();
  }, [session]);

  async function openCancel(bookingId: string) {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    setCancelInfo(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`);
      if (res.ok) {
        const data = await res.json();
        const departure = new Date(data.trip.departure).getTime();
        const created = new Date(data.createdAt).getTime();
        const now = Date.now();
        const policyRes = await fetch('/api/cancellation-policy');
        if (policyRes.ok) {
          const policy = await policyRes.json();
          const hoursSince = (now - created) / 3600000;
          const hoursUntil = (departure - now) / 3600000;
          let pct = 0;
          if (hoursSince < policy.freeWindowMinutes / 60) pct = 100;
          else if (hoursUntil > 24) pct = 100;
          else if (hoursUntil > 12) pct = 50;
          else if (hoursUntil > 4) pct = 25;
          const refundAmount = Math.round(((booking.total * pct) / 100) * 100) / 100;
          setCancelInfo({
            refundAmount,
            cancellationFee: Math.round((booking.total - refundAmount) * 100) / 100,
            refundPercent: pct,
            canCancel: hoursUntil > 0,
          });
        }
      }
    } catch {
      setCancelInfo({ refundAmount: 0, cancellationFee: booking.total, refundPercent: 0, canCancel: false });
    }
    setCancelReason('');
    setCancelId(bookingId);
  }

  async function confirmCancel() {
    if (!cancelId) return;
    const id = cancelId;
    setCancelId(null);
    setCancelling(id);
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', reason: cancelReason }),
      });
      if (res.ok) {
        const data = await res.json();
        setBookings((prev) => prev.map((b) => (b.id === id
          ? { ...b, status: 'CANCELLED', cancelledAt: data.cancelledAt, refundAmount: data.refundAmount, cancellationFee: data.cancellationFee }
          : b)));
      }
    } catch { /* keep list */ } finally { setCancelling(null); }
  }

  function copyRef(ref: string) {
    navigator.clipboard.writeText(ref).catch(() => {});
    setCopied(ref);
    setTimeout(() => setCopied(null), 2000);
  }

  const groups = useMemo(() => {
    const now = Date.now();
    const paid = bookings.filter((b) => b.status === 'PAID');
    return {
      upcoming: paid.filter((b) => new Date(b.actualDeparture || b.trip.departure).getTime() > now),
      pending: bookings.filter((b) => b.status === 'PENDING'),
      past: [...paid.filter((b) => new Date(b.actualDeparture || b.trip.departure).getTime() <= now),
        ...bookings.filter((b) => b.status === 'BOARDED')],
      cancelled: bookings.filter((b) => b.status === 'CANCELLED'),
    } satisfies Record<Tab, Booking[]>;
  }, [bookings]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'upcoming', label: t('v2.tabUpcoming') },
    { key: 'pending', label: t('v2.tabPending') },
    { key: 'past', label: t('v2.tabPast') },
    { key: 'cancelled', label: t('v2.tabCancelled') },
  ];

  if (status === 'loading' || loading) {
    return (
      <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
        <V2SiteHeader />
        <div className="v2-container grid max-w-4xl gap-4 py-10" role="status">
          <V2Skeleton className="h-9 w-56" />
          <V2Skeleton className="h-36 rounded-2xl" />
          <V2Skeleton className="h-36 rounded-2xl" />
        </div>
      </div>
    );
  }

  const list = groups[tab];

  return (
    <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container max-w-4xl pb-16 pt-8 md:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-balance text-[28px] font-extrabold text-[#0B1B33] md:text-[34px]">{t('v2.myBookings')}</h1>
            <p className="mt-1 text-[14.5px] text-[#5B6B84]">{session?.user?.name || session?.user?.email}</p>
          </div>
          <div className="flex gap-2.5">
            <div className="rounded-2xl border border-[#E6EBF2] bg-white px-5 py-2.5 text-center shadow-[0_12px_32px_rgba(11,27,51,0.08)]">
              <p className="text-[20px] font-extrabold tabular-nums text-[#1D5BD8]">{groups.upcoming.length}</p>
              <p className="text-[12px] font-semibold text-[#5B6B84]">{t('v2.tabUpcoming')}</p>
            </div>
            <div className="rounded-2xl border border-[#E6EBF2] bg-white px-5 py-2.5 text-center shadow-[0_12px_32px_rgba(11,27,51,0.08)]">
              <p className="text-[20px] font-extrabold tabular-nums text-emerald-600">{bookings.filter((b) => b.status === 'PAID').length}</p>
              <p className="text-[12px] font-semibold text-[#5B6B84]">{t('common.confirmed')}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 ring-1 ring-[#E6EBF2]" role="tablist">
          {tabs.map((tb) => (
            <button
              key={tb.key} role="tab" aria-selected={tab === tb.key} onClick={() => setTab(tb.key)}
              className={cn(
                'flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-[14px] font-bold tabular-nums transition',
                tab === tb.key ? 'bg-[#0A1E3C] text-white shadow' : 'text-[#5B6B84] hover:bg-slate-50'
              )}
            >
              {tb.label} · {groups[tb.key].length}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {list.length === 0 ? (
            <V2EmptyState
              title={t('v2.noBookingsYet')}
              desc={t('v2.noBookingsDesc')}
              actionLabel={t('v2.browseTrips')}
              onAction={() => router.push('/trips')}
            />
          ) : (
            <div className="grid gap-4">
              {list.map((b, i) => (
                <motion.article
                  key={b.id}
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut', delay: Math.min(i, 5) * 0.05 }}
                  className="v2-card p-5 md:p-6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <V2StatusBadge tone={toneFor(b.status) as 'green' | 'amber' | 'red' | 'blue'}>
                      {t(`booking.${b.status.toLowerCase()}`)}
                    </V2StatusBadge>
                    <button
                      onClick={() => copyRef(b.reference)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-mono text-[12px] tabular-nums text-[#0B1B33] hover:bg-slate-200"
                      dir="ltr"
                      aria-label="Copy booking reference"
                    >
                      {copied === b.reference ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                      {copied === b.reference ? t('v2.copied') : b.reference}
                    </button>
                    <span className="ms-auto text-[15px] font-extrabold tabular-nums text-[#0B1B33]">
                      EGP {b.total.toLocaleString(locale)}
                    </span>
                  </div>

                  <p className="mt-3 text-balance text-[17px] font-extrabold text-[#0B1B33]">
                    {isRTL ? `${b.actualDestination || b.trip.destination} ← ${b.actualOrigin || b.trip.origin}` : `${b.actualOrigin || b.trip.origin} → ${b.actualDestination || b.trip.destination}`}
                  </p>
                  <p className="mt-1.5 text-[14px] tabular-nums text-[#5B6B84]">
                    {new Date(b.actualDeparture || b.trip.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    {' · '}
                    {new Date(b.actualDeparture || b.trip.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{isRTL ? 'مقعد' : 'Seat'} {b.seatLabel} · {b.trip.bus?.name}
                  </p>
                  <p className="mt-1 text-[13px] text-[#5B6B84]">{b.passengerName}</p>

                  <div className="mt-4 flex flex-wrap gap-2.5 border-t border-slate-100 pt-4">
                    <Link href={`/bookings/${b.id}`} className="v2-btn-ghost px-5 py-2.5 text-[14px]">
                      {t('v2.viewTicket')}
                    </Link>
                    <Link href={`/bookings/${b.id}/print`} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-[#5B6B84] hover:bg-slate-100">
                      <Printer className="size-4" /> {t('v2.printTicket')}
                    </Link>
                    {(b.status === 'PAID' || b.status === 'PENDING') && (
                      <button
                        onClick={() => openCancel(b.id)}
                        disabled={cancelling === b.id}
                        className="ms-auto inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {cancelling === b.id && <Loader2 className="size-4 animate-spin" />}
                        {t('v2.cancelBooking')}
                      </button>
                    )}
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Cancel dialog with refund preview */}
      <AnimatePresence>
        {cancelId && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="alertdialog" aria-modal="true" aria-label={t('v2.cancelBooking')}>
            <div className="absolute inset-0 bg-[#0B1B33]/60" onClick={() => setCancelId(null)} />
            <motion.div
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-[440px] rounded-2xl bg-white p-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-[18px] font-extrabold text-[#0B1B33]">{t('v2.cancelBooking')}</p>
                <button onClick={() => setCancelId(null)} aria-label="Close" className="grid size-9 place-items-center rounded-xl text-[#5B6B84] hover:bg-slate-100">
                  <X className="size-5" />
                </button>
              </div>
              {cancelInfo && (
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-emerald-50 p-3.5">
                    <p className="text-[12px] font-semibold text-emerald-700">{t('v2.refundPreview')} ({cancelInfo.refundPercent}%)</p>
                    <p className="mt-1 text-[17px] font-extrabold tabular-nums text-emerald-700">EGP {cancelInfo.refundAmount.toLocaleString(locale)}</p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3.5">
                    <p className="text-[12px] font-semibold text-red-600">{t('v2.cancelFee')}</p>
                    <p className="mt-1 text-[17px] font-extrabold tabular-nums text-red-600">EGP {cancelInfo.cancellationFee.toLocaleString(locale)}</p>
                  </div>
                </div>
              )}
              <textarea
                value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('v2.cancelReason')} rows={2}
                className="v2-input mt-4 min-h-[80px] resize-none py-3 text-[14px]"
              />
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button onClick={() => setCancelId(null)} className="rounded-xl bg-slate-100 py-3.5 text-[14.5px] font-bold text-[#0B1B33] hover:bg-slate-200">
                  {t('v2.keepBooking')}
                </button>
                <button onClick={confirmCancel} disabled={cancelInfo !== null && !cancelInfo.canCancel} className="rounded-xl bg-red-600 py-3.5 text-[14.5px] font-bold text-white hover:bg-red-700 disabled:opacity-50">
                  {t('common.confirm')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <V2SiteFooter />
    </div>
  );
}
