'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Printer, Loader2, X, User } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2Skeleton } from '@/components/v2/ui';

/* V2 company booking detail — same GET/PATCH + policy preview as V1. */

export default function CompanyBookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelInfo, setCancelInfo] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editHotel, setEditHotel] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/company/bookings/${id}`);
      if (res.ok) setBooking(await res.json());
    } catch { /* keep empty */ } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function patch(body: object) {
    setActing(true);
    try {
      const res = await fetch(`/api/company/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setBooking((b: any) => ({ ...b, ...data }));
      }
    } catch { /* keep state */ } finally { setActing(false); }
  }

  async function openCancel() {
    setCancelInfo(null);
    try {
      const policyRes = await fetch('/api/cancellation-policy');
      if (policyRes.ok && booking) {
        const policy = await policyRes.json();
        const hoursUntil = (new Date(booking.actualDeparture || booking.trip?.departure).getTime() - Date.now()) / 3600000;
        let pct = 0;
        if (hoursUntil > 24) pct = 100;
        else if (hoursUntil > 12) pct = 50;
        else if (hoursUntil > 4) pct = 25;
        setCancelInfo({ pct, canCancel: hoursUntil > 0 });
      }
    } catch { setCancelInfo({ pct: 0, canCancel: false }); }
    setCancelOpen(true);
  }

  if (loading) {
    return (
      <div className="grid gap-4" role="status">
        <V2Skeleton className="h-10 w-56" />
        <V2Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="rounded-2xl border border-[#E6EBF2] bg-white p-10 text-center">
        <p className="text-[17px] font-extrabold text-[#0B1B33]">{t('company.noBookings')}</p>
        <Link href="/company/bookings" className="mt-4 inline-flex rounded-xl bg-[#EFF4FF] px-6 py-3 text-[14.5px] font-bold text-[#1D5BD8]">
          {t('company.bookings')}
        </Link>
      </div>
    );
  }

  const active = booking.status === 'PENDING' || booking.status === 'PAID';

  return (
    <div>
      <button onClick={() => router.push('/company/bookings')} className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#5B6B84] hover:text-[#0B1B33]">
        <ArrowRight className="size-4 rotate-180 v2-flip-rtl" /> {t('company.bookings')}
      </button>

      <div className="mt-4 rounded-2xl border border-[#E6EBF2] bg-white p-6 md:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <V2StatusBadge tone={booking.status === 'PAID' ? 'green' : booking.status === 'CANCELLED' ? 'red' : 'amber'}>
            {booking.status}
          </V2StatusBadge>
          <span className="font-mono text-[12.5px] tabular-nums text-[#5B6B84]" dir="ltr">{booking.reference}</span>
          <span className="ms-auto text-[20px] font-extrabold tabular-nums text-[#0B1B33]">
            EGP {Number(booking.total || 0).toLocaleString(locale)}
          </span>
        </div>

        <p className="mt-3.5 text-balance text-[22px] font-extrabold text-[#0B1B33]">
          {isRTL
            ? `${booking.actualDestination || booking.trip?.destination} ← ${booking.actualOrigin || booking.trip?.origin}`
            : `${booking.actualOrigin || booking.trip?.origin} → ${booking.actualDestination || booking.trip?.destination}`}
        </p>
        <p className="mt-1.5 text-[14.5px] tabular-nums text-[#5B6B84]">
          {(booking.actualDeparture || booking.trip?.departure) && new Date(booking.actualDeparture || booking.trip.departure).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}
          {(booking.actualDeparture || booking.trip?.departure) && new Date(booking.actualDeparture || booking.trip.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
        </p>

        <div className="mt-5 grid gap-2.5 rounded-2xl bg-[#F6F8FC] p-4 text-[14.5px] sm:grid-cols-3">
          <p className="flex items-center gap-2 font-semibold text-[#0B1B33]">
            <User className="size-5 shrink-0 text-[#1D5BD8]" /> {booking.passengerName}
          </p>
          <p className="tabular-nums text-[#5B6B84]" dir="ltr" style={{ textAlign: 'start' }}>{booking.passengerPhone}</p>
          <p className="tabular-nums text-[#5B6B84]">
            {isRTL ? 'مقعد' : 'Seat'} {booking.seatLabel}
            {booking.passengerHotel ? ` · ${booking.passengerHotel}` : ''}
          </p>
        </div>
        {booking.customer && (
          <p className="mt-2.5 text-[13.5px] text-[#5B6B84]">{t('company.customerName')}: <strong className="text-[#0B1B33]">{booking.customer.name}</strong></p>
        )}
        {(booking.paidFromWallet || booking.paidOnCredit) && (
          <p className="mt-2 text-[13.5px] tabular-nums text-[#5B6B84]">
            {t('company.paidFromWallet')}: {Number(booking.paidFromWallet || 0).toLocaleString(locale)} · {t('company.paidOnCredit')}: {Number(booking.paidOnCredit || 0).toLocaleString(locale)}
          </p>
        )}

        {active && (
          <div className="mt-5 flex flex-wrap gap-2.5 border-t border-slate-100 pt-5">
            {booking.status === 'PENDING' && (
              <V2Button disabled={acting} onClick={() => patch({ status: 'PAID' })}>
                {acting && <Loader2 className="size-5 animate-spin" />} {t('payment.confirmBtn')}
              </V2Button>
            )}
            <button
              disabled={acting}
              onClick={() => {
                setEditName(booking.passengerName || '');
                setEditPhone(booking.passengerPhone || '');
                setEditHotel(booking.passengerHotel || '');
                setEditOpen(true);
              }}
              className="rounded-xl bg-slate-100 px-5 py-3 text-[14.5px] font-bold text-[#0B1B33] hover:bg-slate-200 disabled:opacity-50"
            >
              {t('common.edit')}
            </button>
            <Link href={`/company/bookings/${booking.id}/print`} className="v2-btn-ghost inline-flex items-center px-5 py-3 text-[14.5px]">
              {t('v2.printTicket')}
            </Link>
            <button
              disabled={acting}
              onClick={openCancel}
              className="ms-auto rounded-xl px-5 py-3 text-[14.5px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {t('v2.cancelBooking')}
            </button>
            {booking.status === 'PAID' && (
              <button
                disabled={acting}
                onClick={() => patch({ status: 'BOARDED' })}
                className="rounded-xl border border-slate-200 px-5 py-3 text-[14.5px] font-bold text-[#0B1B33] hover:bg-slate-50 disabled:opacity-50"
              >
                {t('booking.boarded')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edit passenger */}
      <AnimatePresence>
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={t('common.edit')}>
            <div className="absolute inset-0 bg-[#0B1B33]/60" onClick={() => setEditOpen(false)} />
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="relative w-full max-w-[440px] rounded-2xl bg-white p-6">
              <p className="text-[18px] font-extrabold text-[#0B1B33]">{t('common.edit')}</p>
              <div className="mt-4 grid gap-3">
                <V2Field label={t('company.passengerName')}>
                  <V2Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </V2Field>
                <V2Field label={t('company.passengerPhone')}>
                  <V2Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} dir="ltr" className="tabular-nums" />
                </V2Field>
                <V2Field label={t('v2.hotelPh')}>
                  <V2Input value={editHotel} onChange={(e) => setEditHotel(e.target.value)} />
                </V2Field>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button onClick={() => setEditOpen(false)} className="rounded-xl bg-slate-100 py-3.5 text-[14.5px] font-bold text-[#0B1B33]">{t('common.cancel')}</button>
                <V2Button disabled={acting} onClick={async () => { await patch({ action: 'UPDATE', passengerName: editName, passengerPhone: editPhone, passengerHotel: editHotel }); setEditOpen(false); }}>
                  {t('common.save')}
                </V2Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cancel */}
      <AnimatePresence>
        {cancelOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="alertdialog" aria-modal="true" aria-label={t('v2.cancelBooking')}>
            <div className="absolute inset-0 bg-[#0B1B33]/60" onClick={() => setCancelOpen(false)} />
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="relative w-full max-w-[440px] rounded-2xl bg-white p-6">
              <div className="flex items-center justify-between">
                <p className="text-[18px] font-extrabold text-[#0B1B33]">{t('v2.cancelBooking')}</p>
                <button onClick={() => setCancelOpen(false)} aria-label="Close" className="grid size-9 place-items-center rounded-xl text-[#5B6B84] hover:bg-slate-100">
                  <X className="size-5" />
                </button>
              </div>
              {cancelInfo && (
                <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] font-semibold tabular-nums text-amber-700">
                  {t('v2.refundPreview')}: {cancelInfo.pct}%
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button onClick={() => setCancelOpen(false)} className="rounded-xl bg-slate-100 py-3.5 text-[14.5px] font-bold text-[#0B1B33]">{t('v2.keepBooking')}</button>
                <button
                  disabled={acting || (cancelInfo !== null && !cancelInfo.canCancel)}
                  onClick={async () => { setCancelOpen(false); await patch({ status: 'CANCELLED' }); }}
                  className="rounded-xl bg-red-600 py-3.5 text-[14.5px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
