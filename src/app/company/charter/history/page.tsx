'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Bus, MapPin, Clock, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { V2StatusBadge, V2EmptyState, V2Skeleton } from '@/components/v2/ui';

interface CharterBooking {
  id: string;
  price: number;
  status: string;
  notes: string;
  requestedAt: string;
  createdAt: string;
  trip: {
    id: string;
    origin: string;
    destination: string;
    departure: string;
    arrival: string;
    bus: { name: string; type: string; seatCount: number };
    tripStops: { station: { name: string }; stopOrder: number }[];
  };
}

const toneFor = (s: string): 'green' | 'amber' | 'red' | 'blue' | 'slate' => {
  switch (s) {
    case 'confirmed':
      return 'green';
    case 'requested':
      return 'amber';
    case 'cancel_requested':
      return 'red';
    case 'cancelled':
      return 'slate';
    default:
      return 'blue';
  }
};

export default function CharterHistoryPage() {
  const router = useRouter();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [bookings, setBookings] = useState<CharterBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<CharterBooking | null>(null);

  useEffect(() => {
    loadBookings();
  }, [filter]);

  async function loadBookings() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    try {
      const res = await fetch(`/api/company/charter/bookings?${params}`, { credentials: 'include' });
      const data = await res.json();
      setBookings(data.data || []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelRequest() {
    if (!cancelModal) return;
    setCancellingId(cancelModal.id);
    try {
      const res = await fetch('/api/company/charter/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'cancel_request', bookingId: cancelModal.id }),
      });
      if (res.ok) {
        toast.success(isRTL ? 'تم إرسال طلب إلغاء الحجز' : 'Cancel request sent');
        loadBookings();
      } else {
        const data = await res.json();
        toast.error(data.error || (isRTL ? 'فشل إرسال طلب الإلغاء' : 'Failed to send cancel request'));
      }
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'An error occurred');
    } finally {
      setCancellingId(null);
      setCancelModal(null);
    }
  }

  const filters = [
    { key: '', label: isRTL ? 'الكل' : 'All' },
    { key: 'requested', label: isRTL ? 'قيد المراجعة' : 'Requested' },
    { key: 'confirmed', label: isRTL ? 'مؤكد' : 'Confirmed' },
    { key: 'cancel_requested', label: isRTL ? 'طلب إلغاء' : 'Cancel Pending' },
    { key: 'cancelled', label: isRTL ? 'ملغى' : 'Cancelled' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/company/charter"
            className="p-2.5 rounded-xl border border-[var(--sp-line)] bg-[var(--sp-card)] text-[var(--sp-text-muted)] hover:bg-slate-50 transition"
          >
            <ArrowRight className="size-4 rotate-180 v2-flip-rtl" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-[#0B1B33]">
              {isRTL ? 'سجل طلبات حجز الشارتر' : 'Charter Booking History'}
            </h1>
            <p className="text-xs text-[var(--sp-text-muted)] mt-0.5">
              {isRTL ? 'متابعة حالة طلبات حجز الأتوبيسات الكاملة' : 'Track your company full bus charter reservations'}
            </p>
          </div>
        </div>

        <Link
          href="/company/charter"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0A1E3C] hover:bg-[#153465] text-white text-xs font-bold transition shadow-sm self-start sm:self-auto"
        >
          <Bus size={14} />
          <span>{isRTL ? 'طلب حجز شارتر جديد' : 'New Charter Request'}</span>
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200/80 pb-3">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition',
              filter === f.key
                ? 'bg-[#0A1E3C] text-white shadow-sm'
                : 'bg-[var(--sp-card)] border border-[var(--sp-line)] text-[var(--sp-text-muted)] hover:bg-slate-50 hover:text-[#0B1B33]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          <V2Skeleton className="h-20 w-full rounded-2xl" />
          <V2Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : bookings.length === 0 ? (
        <V2EmptyState
          title={isRTL ? 'لا توجد طلبات شارتر' : 'No charter requests found'}
          desc={isRTL ? 'لم تقدم شركتك أي طلبات حجز مطابقة في هذا القسم' : 'No charter requests match the selected status'}
        />
      ) : (
        <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-100">
            {bookings.map((booking, i) => (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="p-5 hover:bg-slate-50/60 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <V2StatusBadge tone={toneFor(booking.status)}>
                      {booking.status === 'requested'
                        ? isRTL ? 'قيد المراجعة' : 'Requested'
                        : booking.status === 'confirmed'
                        ? isRTL ? 'مؤكد' : 'Confirmed'
                        : booking.status === 'cancel_requested'
                        ? isRTL ? 'بانتظار الإلغاء' : 'Cancel Pending'
                        : isRTL ? 'ملغى' : 'Cancelled'}
                    </V2StatusBadge>

                    <span className="text-xs text-[var(--sp-text-muted)] font-medium flex items-center gap-1">
                      <Bus size={12} className="text-[#1D5BD8]" />
                      {booking.trip.bus.name} ({booking.trip.bus.type})
                    </span>
                  </div>

                  <h3 className="text-base font-extrabold text-[#0B1B33] flex items-center gap-2">
                    <MapPin size={15} className="text-[#1D5BD8] shrink-0" />
                    <span>{booking.trip.origin}</span>
                    <span className="text-slate-400 mx-1">{isRTL ? '←' : '→'}</span>
                    <span>{booking.trip.destination}</span>
                  </h3>

                  <p className="mt-1 text-xs text-[var(--sp-text-muted)] flex flex-wrap items-center gap-3 font-medium">
                    <span className="flex items-center gap-1">
                      <Clock size={12} className="text-[#1D5BD8]" />
                      {new Date(booking.trip.departure).toLocaleDateString(locale, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      {' · '}
                      {new Date(booking.trip.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </p>

                  {booking.notes && (
                    <p className="mt-2 text-xs text-[var(--sp-text-muted)] bg-[var(--sp-inset)] rounded-lg px-3 py-1.5 border border-slate-200/60 inline-block">
                      <strong className="text-[#0B1B33] font-bold">{isRTL ? 'ملاحظات: ' : 'Notes: '}</strong>
                      {booking.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <div className="text-start md:text-end">
                    <span className="text-[11px] text-[var(--sp-text-muted)] block font-medium">
                      {isRTL ? 'المبلغ' : 'Price'}
                    </span>
                    <span className="text-lg font-extrabold text-emerald-600">
                      {Number(booking.price || 0).toLocaleString()} <span className="text-xs font-bold text-[var(--sp-text-muted)]">{t('common.currency')}</span>
                    </span>
                  </div>

                  {booking.status === 'confirmed' && (
                    <button
                      onClick={() => setCancelModal(booking)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition"
                    >
                      {isRTL ? 'طلب إلغاء' : 'Request Cancel'}
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      <AnimatePresence>
        {cancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1B33]/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-[var(--sp-card)] p-6 shadow-xl border border-[var(--sp-line)]"
            >
              <h3 className="text-lg font-extrabold text-[#0B1B33] mb-2 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                {isRTL ? 'طلب إلغاء حجز الشارتر' : 'Request Charter Cancellation'}
              </h3>
              <p className="text-xs text-[var(--sp-text-muted)] leading-relaxed my-3">
                {isRTL
                  ? 'هل أنت متأكد من رغبتك في إرسال طلب إلغاء هذا الحجز؟ سيتم مراجعة الطلب بواسطة الإدارة واسترداد المبلغ إلى المحفظة أو تسوية الائتمان.'
                  : 'Are you sure you want to request cancellation for this charter booking? The admin will review it and refund balances accordingly.'}
              </p>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  onClick={() => setCancelModal(null)}
                  disabled={!!cancellingId}
                  className="px-4 py-2 rounded-xl border border-[var(--sp-line)] bg-[var(--sp-card)] text-xs font-bold text-[var(--sp-text-muted)] hover:bg-slate-50 transition"
                >
                  {isRTL ? 'تراجع' : 'Keep Booking'}
                </button>
                <button
                  onClick={handleCancelRequest}
                  disabled={!!cancellingId}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-sm"
                >
                  {cancellingId && <Loader2 size={13} className="animate-spin" />}
                  {isRTL ? 'تأكيد طلب الإلغاء' : 'Confirm Cancellation'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
