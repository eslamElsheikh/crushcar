'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bus, MapPin, Clock, CheckCircle2, XCircle, Building2, AlertTriangle, Check, X, Loader2 } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { V2StatusBadge, V2EmptyState, V2Skeleton } from '@/components/v2/ui';
import { V2Button } from '@/components/v2/Button';

interface CharterBooking {
  id: string;
  company: { id: string; name: string };
  trip: {
    id: string;
    origin: string;
    destination: string;
    departure: string;
    arrival: string;
    bus: { name: string; type: string; seatCount: number };
    tripStops: { station: { name: string }; stopOrder: number }[];
  };
  price: number;
  status: string;
  notes: string;
  requestedAt: string;
  createdAt: string;
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

export default function AdminCharterBookingsPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [bookings, setBookings] = useState<CharterBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [processing, setProcessing] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    booking: CharterBooking;
    action: 'confirm' | 'cancel' | 'approve_cancel' | 'reject_cancel';
  } | null>(null);

  useEffect(() => {
    loadBookings();
  }, [filter]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') loadBookings(true);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [filter]);

  async function loadBookings(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/charter-bookings?status=${filter}`, { credentials: 'include' });
      const json = await res.json();
      setBookings(json.data || []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction() {
    if (!confirmModal) return;
    const { booking, action } = confirmModal;
    setProcessing(booking.id);
    try {
      const res = await fetch(`/api/admin/charter-bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        toast.success(isRTL ? 'تم تنفيذ الإجراء بنجاح' : 'Action completed successfully');
        loadBookings();
      } else {
        const data = await res.json();
        toast.error(data.message || data.error || (isRTL ? 'حدث خطأ' : 'An error occurred'));
        loadBookings();
      }
    } catch {
      toast.error(isRTL ? 'فشل الاتصال بالخادم' : 'Connection failed');
    } finally {
      setProcessing(null);
      setConfirmModal(null);
    }
  }

  const tabs = [
    { key: 'all', label: isRTL ? 'الكل' : 'All' },
    { key: 'requested', label: isRTL ? 'قيد المراجعة' : 'Requested' },
    { key: 'confirmed', label: isRTL ? 'مؤكد' : 'Confirmed' },
    { key: 'cancel_requested', label: isRTL ? 'طلب إلغاء' : 'Cancel Requested' },
    { key: 'cancelled', label: isRTL ? 'ملغى' : 'Cancelled' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0B1B33]">
            {t('admin.charterBookings') || (isRTL ? 'حجوزات الشارتر' : 'Charter Bookings')}
          </h1>
          <p className="text-sm text-[#5B6B84] mt-1">
            {isRTL ? 'إدارة ومراجعة طلبات حجز الأتوبيسات الكاملة للشركات' : 'Manage and review full bus charter requests from companies'}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200/80 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition',
              filter === tab.key
                ? 'bg-[#0A1E3C] text-white shadow-sm'
                : 'bg-white border border-[#E6EBF2] text-[#5B6B84] hover:bg-slate-50 hover:text-[#0B1B33]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="space-y-3">
          <V2Skeleton className="h-16 w-full rounded-2xl" />
          <V2Skeleton className="h-16 w-full rounded-2xl" />
          <V2Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : bookings.length === 0 ? (
        <V2EmptyState
          title={isRTL ? 'لا توجد طلبات شارتر' : 'No charter bookings found'}
          desc={isRTL ? 'لم يتم العثور على أي طلبات في هذه الحالة' : 'No charter requests match the selected filter'}
        />
      ) : (
        <div className="rounded-2xl border border-[#E6EBF2] bg-white overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-3.5 bg-[#F6F8FC] border-b border-slate-200/80 text-xs font-bold text-[#5B6B84] uppercase tracking-wider">
            <div className="col-span-2">{isRTL ? 'الشركة' : 'Company'}</div>
            <div className="col-span-3">{isRTL ? 'الرحلة والمسار' : 'Trip & Route'}</div>
            <div className="col-span-2">{isRTL ? 'الموعد' : 'Date & Time'}</div>
            <div className="col-span-1">{isRTL ? 'السعر' : 'Price'}</div>
            <div className="col-span-2">{isRTL ? 'الحالة' : 'Status'}</div>
            <div className="col-span-2 text-end">{isRTL ? 'الإجراءات' : 'Actions'}</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-slate-100">
            {bookings.map((booking, i) => (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 px-6 py-4 hover:bg-slate-50/70 transition items-center text-sm"
              >
                {/* Company */}
                <div className="lg:col-span-2">
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-[#1D5BD8] shrink-0" />
                    <span className="font-extrabold text-[#0B1B33] truncate">{booking.company.name}</span>
                  </div>
                </div>

                {/* Trip */}
                <div className="lg:col-span-3">
                  <div className="flex items-center gap-1.5 font-bold text-[#0B1B33]">
                    <MapPin size={14} className="text-[#1D5BD8] shrink-0" />
                    <span>{booking.trip.origin}</span>
                    <span className="text-slate-400 mx-1">{isRTL ? '←' : '→'}</span>
                    <span>{booking.trip.destination}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#5B6B84] mt-1 font-medium">
                    <Bus size={12} className="shrink-0" />
                    <span>{booking.trip.bus.name}</span>
                    <span>•</span>
                    <span>{booking.trip.bus.type}</span>
                    <span>({booking.trip.bus.seatCount} {isRTL ? 'مقعد' : 'seats'})</span>
                  </div>
                </div>

                {/* Date */}
                <div className="lg:col-span-2">
                  <div className="flex items-center gap-1.5 text-xs text-[#0B1B33] font-bold">
                    <Clock size={13} className="text-[#1D5BD8]" />
                    <span>
                      {new Date(booking.trip.departure).toLocaleDateString(locale, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-[#5B6B84] mt-0.5 font-medium">
                    {new Date(booking.trip.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                {/* Price */}
                <div className="lg:col-span-1">
                  <span className="font-extrabold text-emerald-600 block">
                    {Number(booking.price || 0).toLocaleString()} {t('common.currency')}
                  </span>
                </div>

                {/* Status & Notes */}
                <div className="lg:col-span-2">
                  <V2StatusBadge tone={toneFor(booking.status)}>
                    {booking.status === 'requested'
                      ? isRTL ? 'قيد المراجعة' : 'Requested'
                      : booking.status === 'confirmed'
                      ? isRTL ? 'مؤكد' : 'Confirmed'
                      : booking.status === 'cancel_requested'
                      ? isRTL ? 'طلب إلغاء' : 'Cancel Requested'
                      : isRTL ? 'ملغى' : 'Cancelled'}
                  </V2StatusBadge>
                  {booking.notes && (
                    <p className="text-[11px] text-[#5B6B84] mt-1 truncate" title={booking.notes}>
                      {booking.notes}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="lg:col-span-2 flex justify-start lg:justify-end gap-2 pt-2 lg:pt-0">
                  {booking.status === 'requested' && (
                    <>
                      <button
                        onClick={() => setConfirmModal({ booking, action: 'confirm' })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
                      >
                        <Check size={13} />
                        {isRTL ? 'تأكيد' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmModal({ booking, action: 'cancel' })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition border border-red-200"
                      >
                        <X size={13} />
                        {isRTL ? 'إلغاء' : 'Cancel'}
                      </button>
                    </>
                  )}

                  {booking.status === 'cancel_requested' && (
                    <>
                      <button
                        onClick={() => setConfirmModal({ booking, action: 'approve_cancel' })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-sm"
                      >
                        <Check size={13} />
                        {isRTL ? 'قبول الإلغاء' : 'Approve'}
                      </button>
                      <button
                        onClick={() => setConfirmModal({ booking, action: 'reject_cancel' })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0B1B33] text-xs font-bold transition"
                      >
                        <X size={13} />
                        {isRTL ? 'رفض' : 'Reject'}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1B33]/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#E6EBF2]"
            >
              <h3 className="text-lg font-extrabold text-[#0B1B33] mb-2 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                {confirmModal.action === 'confirm'
                  ? isRTL ? 'تأكيد حجز الشارتر' : 'Confirm Charter Booking'
                  : confirmModal.action === 'approve_cancel'
                  ? isRTL ? 'الموافقة على طلب الإلغاء والرد' : 'Approve Cancellation & Refund'
                  : confirmModal.action === 'reject_cancel'
                  ? isRTL ? 'رفض طلب الإلغاء' : 'Reject Cancellation'
                  : isRTL ? 'إلغاء الطلب' : 'Cancel Request'}
              </h3>

              <div className="my-4 rounded-xl bg-[#F6F8FC] p-4 text-xs space-y-2 border border-slate-200/60">
                <div className="flex justify-between">
                  <span className="text-[#5B6B84]">{isRTL ? 'الشركة' : 'Company'}</span>
                  <span className="font-bold text-[#0B1B33]">{confirmModal.booking.company.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5B6B84]">{isRTL ? 'الرحلة' : 'Trip'}</span>
                  <span className="font-bold text-[#0B1B33]">
                    {confirmModal.booking.trip.origin} ← {confirmModal.booking.trip.destination}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5B6B84]">{isRTL ? 'المبلغ' : 'Amount'}</span>
                  <span className="font-extrabold text-emerald-600">
                    {confirmModal.booking.price.toLocaleString()} {t('common.currency')}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setConfirmModal(null)}
                  disabled={!!processing}
                  className="px-4 py-2 rounded-xl border border-[#E6EBF2] bg-white text-xs font-bold text-[#5B6B84] hover:bg-slate-50 transition"
                >
                  {isRTL ? 'رجوع' : 'Back'}
                </button>
                <button
                  onClick={handleAction}
                  disabled={!!processing}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm',
                    confirmModal.action === 'confirm'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  )}
                >
                  {processing && <Loader2 size={13} className="animate-spin" />}
                  {isRTL ? 'تأكيد الإجراء' : 'Confirm Action'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
