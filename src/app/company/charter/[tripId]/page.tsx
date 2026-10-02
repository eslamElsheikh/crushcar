'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Bus, MapPin, Clock, Users, Send, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { V2StatusBadge, V2Skeleton } from '@/components/v2/ui';

interface TripDetail {
  id: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  busPrice: number | null;
  price: number;
  bus: { name: string; type: string; seatCount: number };
  tripStops: { station: { name: string }; stopOrder: number; priceFromOrigin: number; arrivalTime: string | null; departureTime: string | null }[];
}

export default function CharterTripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch('/api/company/charter/trips?', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const found = (data.data || []).find((t: any) => t.id === tripId);
        setTrip(found || null);
      })
      .catch(() => setTrip(null))
      .finally(() => setLoading(false));
  }, [tripId]);

  async function handleRequest() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/company/charter/bookings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, notes }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
        toast.success(isRTL ? 'تم إرسال طلب الشارتر بنجاح' : 'Charter request submitted successfully');
      } else {
        toast.error(data.message || data.error || (isRTL ? 'فشل إرسال الطلب' : 'Failed to submit request'));
      }
    } catch {
      toast.error(isRTL ? 'فشل إرسال الطلب' : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto py-8">
        <V2Skeleton className="h-6 w-36 rounded-xl" />
        <V2Skeleton className="h-48 w-full rounded-2xl" />
        <V2Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="rounded-2xl border border-[#E6EBF2] bg-white p-8 shadow-sm">
          <Bus size={40} className="mx-auto text-slate-400 mb-3" />
          <h3 className="text-lg font-extrabold text-[#0B1B33]">
            {isRTL ? 'الرحلة غير موجودة' : 'Trip not found'}
          </h3>
          <p className="text-xs text-[#5B6B84] mt-1 mb-5">
            {isRTL ? 'ربما تم حجز هذه الرحلة بالفعل أو تغيير حالتها' : 'This trip may have already been reserved or removed'}
          </p>
          <Link
            href="/company/charter"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0A1E3C] text-white text-xs font-bold"
          >
            {isRTL ? 'الرجوع لرحلات الشارتر' : 'Back to charter trips'}
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto text-center py-12"
      >
        <div className="rounded-3xl border border-[#E6EBF2] bg-white p-8 shadow-xl">
          <div className="size-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={36} />
          </div>
          <h2 className="text-2xl font-extrabold text-[#0B1B33]">
            {isRTL ? 'تم تقديم طلب الحجز بنجاح' : 'Request Submitted Successfully'}
          </h2>
          <p className="text-xs text-[#5B6B84] mt-2 mb-6 leading-relaxed">
            {isRTL
              ? 'تم إرسال طلب حجز الأتوبيس بالكامل إلى الإدارة، وسيتم مراجعته وتأكيده وخصم الرصيد تلقائياً.'
              : 'Your full bus charter request was sent to the administration. It will be reviewed, confirmed, and balances processed.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/company/charter/history"
              className="px-6 py-3 rounded-xl bg-[#0A1E3C] hover:bg-[#153465] text-white text-xs font-bold transition shadow-sm"
            >
              {isRTL ? 'متابعة طلباتي' : 'View My Requests'}
            </Link>
            <Link
              href="/company/charter"
              className="px-6 py-3 rounded-xl border border-[#E6EBF2] bg-white text-xs font-bold text-[#5B6B84] hover:bg-slate-50 transition"
            >
              {isRTL ? 'استعراض رحلات أخرى' : 'Browse other trips'}
            </Link>
          </div>
        </div>
      </motion.div>
    );
  }

  const busPrice = trip.busPrice || trip.price || 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back Link */}
      <Link
        href="/company/charter"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5B6B84] hover:text-[#0B1B33] transition"
      >
        <ArrowRight className="size-4 rotate-180 v2-flip-rtl" />
        <span>{isRTL ? 'الرجوع إلى رحلات الشارتر' : 'Back to charter trips'}</span>
      </Link>

      {/* Main Details Card */}
      <div className="rounded-2xl border border-[#E6EBF2] bg-white p-6 md:p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-100">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1D5BD8] bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              {isRTL ? 'حجز الأتوبيس بالكامل' : 'Full Bus Charter'}
            </span>
            <h1 className="text-2xl font-extrabold text-[#0B1B33] mt-2 flex items-center gap-2">
              <MapPin size={22} className="text-[#1D5BD8] shrink-0" />
              <span>{trip.origin}</span>
              <span className="text-slate-400 mx-1">{isRTL ? '←' : '→'}</span>
              <span>{trip.destination}</span>
            </h1>
          </div>

          <div className="text-start sm:text-end">
            <span className="text-[11px] font-medium text-[#5B6B84] block">
              {isRTL ? 'سعر حجز الأتوبيس' : 'Charter Price'}
            </span>
            <span className="text-2xl font-extrabold text-emerald-600">
              {Number(busPrice).toLocaleString(locale)} <span className="text-xs font-bold text-[#5B6B84]">{t('common.currency')}</span>
            </span>
          </div>
        </div>

        {/* Bus & Date specs */}
        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl bg-[#F6F8FC] p-3.5 border border-slate-200/60">
            <span className="text-[11px] font-bold text-[#5B6B84] block mb-1">
              {isRTL ? 'الأوتوبيس' : 'Bus Details'}
            </span>
            <p className="text-xs font-extrabold text-[#0B1B33] flex items-center gap-1.5">
              <Bus size={13} className="text-[#1D5BD8]" />
              {trip.bus.name} ({trip.bus.type})
            </p>
          </div>

          <div className="rounded-xl bg-[#F6F8FC] p-3.5 border border-slate-200/60">
            <span className="text-[11px] font-bold text-[#5B6B84] block mb-1">
              {isRTL ? 'عدد المقاعد' : 'Total Seats'}
            </span>
            <p className="text-xs font-extrabold text-[#0B1B33] flex items-center gap-1.5">
              <Users size={13} className="text-[#1D5BD8]" />
              {trip.bus.seatCount} {isRTL ? 'مقعد مخصص بالكامل' : 'Reserved seats'}
            </p>
          </div>

          <div className="rounded-xl bg-[#F6F8FC] p-3.5 border border-slate-200/60">
            <span className="text-[11px] font-bold text-[#5B6B84] block mb-1">
              {isRTL ? 'موعد الانطلاق' : 'Departure'}
            </span>
            <p className="text-xs font-extrabold text-[#0B1B33] flex items-center gap-1.5">
              <Clock size={13} className="text-[#1D5BD8]" />
              {new Date(trip.departure).toLocaleDateString(locale, { month: 'short', day: 'numeric' })} · {new Date(trip.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Intermediate Stops if any */}
        {trip.tripStops && trip.tripStops.length > 0 && (
          <div className="mb-6 rounded-xl bg-[#F6F8FC] p-4 border border-slate-200/60">
            <span className="text-xs font-bold text-[#5B6B84] block mb-2">
              {isRTL ? 'مسار الرحلة والمحطات المتاحة' : 'Trip Route & Stops'}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {trip.tripStops.map((stop, idx) => (
                <span key={stop.stopOrder || idx} className="flex items-center gap-2">
                  <span className="font-bold text-[#0B1B33]">{stop.station?.name}</span>
                  {idx < trip.tripStops.length - 1 && <span className="text-slate-400">{isRTL ? '←' : '→'}</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes Input */}
        <div className="space-y-2 mb-6">
          <label className="block text-xs font-bold text-[#0B1B33]">
            {isRTL ? 'ملاحظات أو متطلبات خاصة بالرحلة (اختياري)' : 'Special notes or requirements (Optional)'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isRTL ? 'اكتب أي تفاصيل إضافية عن الرحلة، أرقام التواصل، مكان التجمع...' : 'Enter any extra details, contacts, or pickup info...'}
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-[#F6F8FC] border border-[#E6EBF2] text-xs font-medium text-[#0B1B33] placeholder:text-[#9AA8BD] focus:outline-none focus:border-[#1D5BD8] focus:bg-white transition resize-none"
          />
        </div>

        {/* Notice & Submit Button */}
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3.5 mb-6 text-xs text-[#1D5BD8] flex items-center gap-2">
          <ShieldCheck size={16} className="shrink-0" />
          <span>
            {isRTL
              ? 'عند إرسال الطلب سيتم مراجعته فوراً، وسيتم خصم التكلفة من رصيد المحفظة أو الائتمان المتاح لشركتك بعد التأكيد.'
              : 'Upon submission, the request will be reviewed by admin. Payment will be deducted from your wallet or credit after confirmation.'}
          </span>
        </div>

        <button
          onClick={handleRequest}
          disabled={submitting}
          className="w-full py-3.5 px-6 rounded-xl bg-[#0A1E3C] hover:bg-[#153465] text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          <span>{isRTL ? 'تأكيد وإرسال طلب حجز الشارتر' : 'Submit Charter Booking Request'}</span>
        </button>
      </div>
    </div>
  );
}
