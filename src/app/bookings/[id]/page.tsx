'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight, Bus, MapPin, Clock, Calendar, User, Phone,
  QrCode, CheckCircle2, XCircle, AlertCircle, Loader2, Printer, Copy, Check,
  CreditCard, Armchair, Building2, FileText, Banknote, ShieldCheck
} from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { cn } from '@/lib/utils';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2Skeleton } from '@/components/v2/ui';

interface BookingData {
  id: string;
  reference: string;
  seatLabel: string;
  status: string;
  total: number;
  paidAt: string | null;
  createdAt: string;
  passengerName?: string;
  passengerPhone?: string;
  passengerHotel?: string;
  passengerNotes?: string;
  collectAmount?: number | null;
  actualOrigin?: string;
  actualDestination?: string;
  actualDeparture?: string;
  fromStopOrder?: number;
  toStopOrder?: number;
  roundTripGroupId?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  refundAmount?: number | null;
  cancellationFee?: number | null;
  refundProcessedAt?: string | null;
  refundProcessedBy?: string | null;
  user: { name: string; email: string; phone: string };
  trip: {
    id: string;
    origin: string;
    destination: string;
    departure: string;
    arrival: string;
    status: string;
    bus: {
      name: string;
      type: string;
      company: { name: string };
    };
  };
  tripStops?: Array<{
    id: string;
    stationId: string;
    stopOrder: number;
    priceFromOrigin: number;
    station?: { name: string };
  }>;
}

const toneFor = (s: string): 'green' | 'amber' | 'red' | 'blue' | 'slate' => {
  switch (s) {
    case 'PAID':
    case 'CONFIRMED':
      return 'green';
    case 'PENDING':
      return 'amber';
    case 'CANCELLED':
      return 'red';
    default:
      return 'blue';
  }
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';
  const t = useLangStore((s) => s.t);

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadBooking();
  }, [bookingId]);

  async function loadBooking() {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/ticket`);
      if (res.ok) {
        const data = await res.json();
        setBooking(data);
        setQrCode(data.qrCode || '');
      } else {
        router.push('/bookings');
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  function copyRef(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
        <V2SiteHeader />
        <main className="v2-container py-12">
          <div className="max-w-4xl mx-auto space-y-4" role="status">
            <V2Skeleton className="h-6 w-48 rounded-xl" />
            <V2Skeleton className="h-36 w-full rounded-2xl" />
            <div className="grid lg:grid-cols-[1fr,340px] gap-6">
              <V2Skeleton className="h-80 rounded-2xl" />
              <V2Skeleton className="h-80 rounded-2xl" />
            </div>
          </div>
        </main>
        <V2SiteFooter />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
        <V2SiteHeader />
        <main className="v2-container py-16 text-center">
          <div className="max-w-md mx-auto bg-white rounded-2xl border border-[#E6EBF2] p-8 shadow-sm">
            <p className="text-lg font-extrabold text-[#0B1B33]">
              {isRTL ? 'لم يتم العثور على الحجز' : 'Booking not found'}
            </p>
            <Link
              href="/bookings"
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0A1E3C] text-white text-sm font-bold"
            >
              {isRTL ? 'الرجوع إلى حجوزاتي' : 'Back to my bookings'}
            </Link>
          </div>
        </main>
        <V2SiteFooter />
      </div>
    );
  }

  const isPaid = booking.status === 'PAID';
  const isCancelled = booking.status === 'CANCELLED';
  const origin = booking.actualOrigin || booking.trip.origin;
  const destination = booking.actualDestination || booking.trip.destination;
  const departureDate = booking.actualDeparture || booking.trip.departure;
  const busName = booking.trip.bus.name;
  const companyName = booking.trip.bus.company?.name;

  return (
    <div className="v2 min-h-dvh bg-[#F6F8FC] text-[#0B1B33]" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ── TOP SITE HEADER ──────────────────────────── */}
      <V2SiteHeader />

      <main className="v2-container pb-20 pt-6 md:pt-8">
        {/* ── BREADCRUMB & ACTIONS ────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <Link
            href="/bookings"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5B6B84] hover:text-[#0B1B33] transition"
          >
            <ArrowRight className="size-4 rotate-180 v2-flip-rtl" />
            {isRTL ? 'الرجوع إلى حجوزاتي' : 'Back to my bookings'}
          </Link>

          <Link
            href={`/bookings/${booking.id}/print`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#E6EBF2] text-xs font-bold text-[#0B1B33] hover:bg-slate-50 transition shadow-sm"
          >
            <Printer size={15} className="text-[#1D5BD8]" />
            {booking.roundTripGroupId
              ? isRTL
                ? 'طباعة التذكرة (ذهاب وعودة)'
                : 'Print Ticket (Round Trip)'
              : isRTL
              ? 'طباعة التذكرة'
              : 'Print Ticket'}
          </Link>
        </div>

        {/* ── ROUTE HERO BANNER ───────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[#E6EBF2] bg-white p-6 md:p-7 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-5"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <V2StatusBadge tone={toneFor(booking.status)}>
                {t(`booking.${booking.status.toLowerCase()}`) || booking.status}
              </V2StatusBadge>

              <button
                onClick={() => copyRef(booking.reference)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1 font-mono text-xs font-bold text-[#0B1B33] transition"
                dir="ltr"
                title={isRTL ? 'انقر لنسخ رقم الحجز' : 'Click to copy reference'}
              >
                {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                <span>{booking.reference}</span>
                {copied && <span className="text-[10px] text-emerald-600 font-bold ms-1">{isRTL ? 'تم النسخ' : 'Copied'}</span>}
              </button>

              {booking.roundTripGroupId && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-[#1D5BD8] border border-blue-200 px-3 py-1 text-xs font-bold">
                  {isRTL ? 'ذهاب وعودة' : 'Round Trip'}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-extrabold text-[#0B1B33] md:text-3xl flex items-center gap-2">
              <MapPin size={22} className="text-[#1D5BD8] shrink-0" />
              <span>{origin}</span>
              <span className="text-slate-400 mx-1">{isRTL ? '←' : '→'}</span>
              <span>{destination}</span>
            </h1>

            <p className="mt-2 text-xs text-[#5B6B84] flex flex-wrap items-center gap-3 font-medium">
              <span className="flex items-center gap-1">
                <Calendar size={13} className="text-[#1D5BD8]" />
                {formatDate(departureDate)}
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <Clock size={13} className="text-[#1D5BD8]" />
                {formatTime(departureDate)}
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <Bus size={13} className="text-[#1D5BD8]" />
                {busName} {companyName ? `(${companyName})` : ''}
              </span>
            </p>
          </div>

          <div className="text-start md:text-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 shrink-0">
            <span className="text-xs text-[#5B6B84] block font-medium">
              {isRTL ? 'إجمالي المدفوع' : 'Total Amount'}
            </span>
            <span className="text-2xl font-extrabold text-emerald-600">
              {Math.round(booking.total).toLocaleString(locale)}{' '}
              <span className="text-xs font-bold text-[#5B6B84]">{t('common.currency')}</span>
            </span>
          </div>
        </motion.div>

        {/* ── TWO-COLUMN MAIN CONTENT ─────────────────── */}
        <div className="grid lg:grid-cols-[1fr,360px] gap-6 items-start">
          {/* ── LEFT: TRIP, PASSENGER & CANCELLATION DETAILS ── */}
          <div className="space-y-6">
            {/* Trip stops / path if multi-stop */}
            {booking.tripStops && booking.tripStops.length > 0 && booking.fromStopOrder && booking.toStopOrder && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-[#E6EBF2] bg-white p-6 shadow-sm"
              >
                <h3 className="text-sm font-extrabold text-[#0B1B33] uppercase tracking-wider mb-4 flex items-center gap-2">
                  <MapPin size={16} className="text-[#1D5BD8]" />
                  {isRTL ? 'مسار الرحلة والمحطات' : 'Route & Station Stops'}
                </h3>

                <div className="space-y-3">
                  {(() => {
                    const relevantStops = booking.tripStops!
                      .filter((s: any) => s.stopOrder >= booking.fromStopOrder! && s.stopOrder <= booking.toStopOrder!)
                      .sort((a: any, b: any) => a.stopOrder - b.stopOrder);

                    return relevantStops.map((stop: any, idx: number) => {
                      const isFirst = idx === 0;
                      const isLast = idx === relevantStops.length - 1;
                      return (
                        <div key={stop.id} className="flex items-center gap-3">
                          <div
                            className={cn(
                              'size-3.5 rounded-full shrink-0 border-2',
                              isFirst
                                ? 'border-[#1D5BD8] bg-[#1D5BD8] shadow-[0_0_8px_rgba(29,91,216,0.5)]'
                                : isLast
                                ? 'border-emerald-600 bg-emerald-600 shadow-[0_0_8px_rgba(5,150,105,0.5)]'
                                : 'border-slate-300 bg-white'
                            )}
                          />
                          <p
                            className={cn(
                              'text-sm font-semibold',
                              isFirst
                                ? 'text-[#1D5BD8] font-bold'
                                : isLast
                                ? 'text-emerald-700 font-bold'
                                : 'text-[#5B6B84]'
                            )}
                          >
                            {stop.station?.name}
                          </p>
                          {(isFirst || isLast) && (
                            <span
                              className={cn(
                                'ms-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                                isFirst
                                  ? 'text-[#1D5BD8] bg-blue-50 border-blue-200'
                                  : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              )}
                            >
                              {isFirst ? (isRTL ? 'صعود' : 'BOARD') : (isRTL ? 'نزول' : 'ALIGHT')}
                            </span>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </motion.div>
            )}

            {/* Passenger Info Card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-2xl border border-[#E6EBF2] bg-white p-6 shadow-sm"
            >
              <h3 className="text-sm font-extrabold text-[#0B1B33] uppercase tracking-wider mb-4 flex items-center gap-2">
                <User size={16} className="text-[#1D5BD8]" />
                {isRTL ? 'بيانات المسافر' : 'Passenger Information'}
              </h3>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-[#F6F8FC] p-3.5 border border-slate-200/60">
                  <span className="text-[11px] font-bold text-[#5B6B84] block mb-1">
                    {isRTL ? 'اسم المسافر' : 'Passenger Name'}
                  </span>
                  <span className="text-sm font-extrabold text-[#0B1B33]">
                    {booking.passengerName || booking.user.name}
                  </span>
                </div>

                {(booking.passengerPhone || booking.user.phone) && (
                  <div className="rounded-xl bg-[#F6F8FC] p-3.5 border border-slate-200/60">
                    <span className="text-[11px] font-bold text-[#5B6B84] block mb-1">
                      {isRTL ? 'رقم الهاتف' : 'Phone'}
                    </span>
                    <span className="text-sm font-bold font-mono text-[#0B1B33]">
                      {booking.passengerPhone || booking.user.phone}
                    </span>
                  </div>
                )}

                {booking.passengerHotel && (
                  <div className="rounded-xl bg-[#F6F8FC] p-3.5 border border-slate-200/60">
                    <span className="text-[11px] font-bold text-[#5B6B84] block mb-1">
                      {isRTL ? 'مكان الإقامة / الفندق' : 'Hotel / Pickup'}
                    </span>
                    <span className="text-sm font-bold text-[#0B1B33]">
                      {booking.passengerHotel}
                    </span>
                  </div>
                )}

                {booking.collectAmount != null && booking.collectAmount > 0 && (
                  <div className="rounded-xl bg-[#F6F8FC] p-3.5 border border-slate-200/60">
                    <span className="text-[11px] font-bold text-[#5B6B84] block mb-1">
                      {isRTL ? 'مبلغ التحصيل' : 'Collect Amount'}
                    </span>
                    <span className="text-sm font-extrabold text-amber-700">
                      {Number(booking.collectAmount || 0).toLocaleString(locale)} {t('common.currency')}
                    </span>
                  </div>
                )}
              </div>

              {booking.passengerNotes && (
                <div className="mt-4 rounded-xl bg-[#F6F8FC] p-3.5 border border-slate-200/60">
                  <span className="text-[11px] font-bold text-[#5B6B84] block mb-1">
                    {isRTL ? 'ملاحظات إضافية' : 'Notes'}
                  </span>
                  <p className="text-xs text-[#0B1B33] font-medium leading-relaxed">
                    {booking.passengerNotes}
                  </p>
                </div>
              )}
            </motion.div>

            {/* Cancellation info (if cancelled) */}
            {isCancelled && (booking.cancelledAt || booking.refundAmount !== undefined) && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-sm"
              >
                <h3 className="text-sm font-extrabold text-red-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-600" />
                  {t('cancel.policy') || (isRTL ? 'بيانات إلغاء الحجز' : 'Cancellation Details')}
                </h3>

                <div className="space-y-3 text-xs">
                  {booking.cancelledAt && (
                    <div className="flex justify-between items-center py-1.5 border-b border-red-100">
                      <span className="text-[#5B6B84]">{t('cancel.cancelledAt') || (isRTL ? 'تاريخ الإلغاء' : 'Cancelled At')}</span>
                      <span className="font-bold text-[#0B1B33]">{formatDate(booking.cancelledAt)}</span>
                    </div>
                  )}

                  {booking.cancellationReason && (
                    <div className="flex justify-between items-center py-1.5 border-b border-red-100">
                      <span className="text-[#5B6B84]">{t('cancel.reasonLabel') || (isRTL ? 'سبب الإلغاء' : 'Reason')}</span>
                      <span className="font-bold text-[#0B1B33]">{booking.cancellationReason}</span>
                    </div>
                  )}

                  {booking.refundAmount !== undefined && booking.refundAmount !== null && (
                    <div className="flex justify-between items-center py-1.5 border-b border-red-100">
                      <span className="text-[#5B6B84]">{t('cancel.refundedAmount') || (isRTL ? 'المبلغ المسترد' : 'Refunded Amount')}</span>
                      <span className="font-extrabold text-emerald-700">
                        {Math.round(booking.refundAmount).toLocaleString(locale)} {t('common.currency')}
                      </span>
                    </div>
                  )}

                  {booking.cancellationFee !== undefined && booking.cancellationFee !== null && booking.cancellationFee > 0 && (
                    <div className="flex justify-between items-center py-1.5 border-b border-red-100">
                      <span className="text-[#5B6B84]">{t('cancel.fee') || (isRTL ? 'رسوم الإلغاء' : 'Cancellation Fee')}</span>
                      <span className="font-bold text-red-600">
                        {Math.round(booking.cancellationFee).toLocaleString(locale)} {t('common.currency')}
                      </span>
                    </div>
                  )}

                  {booking.refundAmount !== undefined && booking.refundAmount !== null && booking.refundAmount > 0 && (
                    <div className="pt-2">
                      {booking.refundProcessedAt ? (
                        <div className="flex items-center gap-2 text-emerald-700 font-bold">
                          <CheckCircle2 size={15} />
                          <span>{t('cancel.refundProcessed') || (isRTL ? 'تم تنفيذ الاسترداد' : 'Refund Processed')}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-700 font-bold">
                          <Clock size={15} />
                          <span>{t('cancel.refundPending') || (isRTL ? 'الاسترداد قيد المراجعة' : 'Refund Pending')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* ── RIGHT: DIGITAL BOARDING PASS / QR CARD ── */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-[#E6EBF2] bg-white p-6 shadow-sm sticky top-24"
          >
            <div className="border-b border-slate-100 pb-4 mb-5 text-center">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1D5BD8] bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                {isRTL ? 'تذكرة الصعود الإلكترونية' : 'Digital Boarding Pass'}
              </span>
            </div>

            {/* Seat & Price Hero */}
            <div className="bg-[#F6F8FC] rounded-2xl p-4 text-center mb-5 border border-slate-200/60">
              <span className="text-xs font-bold text-[#5B6B84] block mb-1">
                {isRTL ? 'رقم المقعد المحجوز' : 'Reserved Seat'}
              </span>
              <div className="flex items-center justify-center gap-2 text-3xl font-extrabold font-mono text-[#1D5BD8]">
                <Armchair size={26} />
                <span>{booking.seatLabel}</span>
              </div>
              <span className="text-xs font-bold text-slate-400 block mt-1">
                {busName} • {booking.trip.bus.type || 'Standard'}
              </span>
            </div>

            {/* QR Code */}
            {qrCode ? (
              <div className="text-center mb-5">
                <div className="inline-block p-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <img
                    src={qrCode}
                    alt={`QR Code for ${booking.reference}`}
                    className="w-36 h-36 mx-auto object-contain"
                  />
                </div>
                <p className="font-mono text-xs font-bold text-[#5B6B84] mt-2 tracking-wider">
                  {booking.reference}
                </p>
              </div>
            ) : null}

            {/* Payment & Date Details */}
            <div className="space-y-2.5 text-xs border-t border-slate-100 pt-4 mb-5">
              <div className="flex justify-between items-center">
                <span className="text-[#5B6B84] font-medium">{isRTL ? 'تاريخ الحجز' : 'Booked At'}</span>
                <span className="font-bold text-[#0B1B33]">{formatDate(booking.createdAt)}</span>
              </div>

              {booking.paidAt && (
                <div className="flex justify-between items-center">
                  <span className="text-[#5B6B84] font-medium">{isRTL ? 'تاريخ الدفع' : 'Paid At'}</span>
                  <span className="font-bold text-emerald-700">{formatDate(booking.paidAt)}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-sm">
                <span className="font-bold text-[#0B1B33]">{isRTL ? 'المبلغ' : 'Amount'}</span>
                <span className="text-xl font-extrabold text-[#0B1B33]">
                  {Math.round(booking.total).toLocaleString(locale)}{' '}
                  <span className="text-xs font-bold text-[#5B6B84]">{t('common.currency')}</span>
                </span>
              </div>
            </div>

            {/* Print Ticket Button */}
            <Link
              href={`/bookings/${booking.id}/print`}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0A1E3C] hover:bg-[#153465] text-white text-xs font-bold transition shadow-sm"
            >
              <Printer size={15} />
              <span>{isRTL ? 'طباعة التذكرة' : 'Print Ticket'}</span>
            </Link>
          </motion.div>
        </div>
      </main>

      {/* ── FOOTER ───────────────────────────────────── */}
      <V2SiteFooter />
    </div>
  );
}
