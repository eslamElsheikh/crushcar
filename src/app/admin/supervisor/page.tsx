'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Route, CheckCircle2, XCircle, Search, Loader2, RefreshCw, Bus, Clock } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { V2StatusBadge, V2EmptyState } from '@/components/v2/ui';

interface BookingBrief {
  id: string;
  reference: string;
  passengerName: string;
  seatLabel: string;
  status: string;
  boarded?: boolean;
  boardedAt?: string | null;
  _type: 'booking' | 'companyBooking';
}

interface TripWithBookings {
  id: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  bus?: { name: string; type?: string; seatCount?: number };
  bookings: BookingBrief[];
}

export default function AdminSupervisorPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [trips, setTrips] = useState<TripWithBookings[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [boardingId, setBoardingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!session) return;
    if (session?.user?.role === 'CUSTOMER') {
      router.replace('/trips');
      return;
    }
    fetchTrips();
  }, [session, router]);

  async function fetchTrips() {
    setLoading(true);
    try {
      const res = await fetch('/api/trips?all=true&take=50');
      const json = await res.json();
      const tripList: any[] = json.data || json.trips || [];
      setTrips(
        tripList.map((trip: any) => {
          const customerBookings: BookingBrief[] = (trip.bookings || []).map((b: any) => ({
            ...b,
            passengerName: b.passengerName || '—',
            _type: 'booking',
          }));
          const companyBookingsList: BookingBrief[] = (trip.companyBookings || []).map((b: any) => ({
            ...b,
            passengerName: b.passengerName || '—',
            _type: 'companyBooking',
          }));
          return {
            id: trip.id,
            origin: trip.origin,
            destination: trip.destination,
            departure: trip.departure,
            arrival: trip.arrival,
            bus: trip.bus,
            bookings: [...customerBookings, ...companyBookingsList],
          };
        })
      );
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }

  async function markBoarded(booking: BookingBrief) {
    setBoardingId(booking.id);
    try {
      const endpoint =
        booking._type === 'companyBooking'
          ? `/api/company/bookings/${booking.id}`
          : `/api/bookings/${booking.id}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'BOARDED' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || err.message || (isRTL ? 'فشل تأكيد الصعود' : 'Failed to confirm boarding'));
        return;
      }
      setTrips((prev) =>
        prev.map((trip) => ({
          ...trip,
          bookings: trip.bookings.map((b) =>
            b.id === booking.id ? { ...b, status: 'BOARDED', boarded: true, boardedAt: new Date().toISOString() } : b
          ),
        }))
      );
      toast.success(isRTL ? 'تم تسجيل صعود الراكب بنجاح' : 'Passenger boarding confirmed');
    } finally {
      setBoardingId(null);
    }
  }

  const filteredTrips = trips.filter((trip) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      trip.origin.toLowerCase().includes(q) ||
      trip.destination.toLowerCase().includes(q) ||
      trip.bookings.some(
        (b) => b.passengerName.toLowerCase().includes(q) || b.reference.toLowerCase().includes(q)
      )
    );
  });

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#0066FF]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#0B1B33]">
              {isRTL ? 'بوابة المشرفين لتأكيد الصعود' : 'Supervisor Boarding Desk'}
            </h1>
            <p className="text-sm font-semibold text-slate-500">
              {isRTL
                ? 'متابعة الركاب والتحقق من التذاكر وتأكيد صعود الحافلة'
                : 'Manage passenger manifest and record live boarding status'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchTrips}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm transition"
        >
          <RefreshCw className="size-4" />
          {isRTL ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isRTL ? 'بحث برقم الحجز أو اسم الراكب أو المحطة...' : 'Search booking ref, passenger name or route...'}
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-[#0B1B33] placeholder:text-slate-400 focus:border-[#0066FF] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20"
        />
      </div>

      {/* Trips Accordion List */}
      {filteredTrips.length === 0 ? (
        <V2EmptyState
          title={isRTL ? 'لا توجد رحلات متاحة' : 'No trips found'}
          desc={isRTL ? 'لا توجد رحلات مجدولة مطابقة لخيارات البحث.' : 'No scheduled trips matching your query.'}
        />
      ) : (
        <div className="space-y-4">
          {filteredTrips.map((trip, idx) => {
            const bookedCount = trip.bookings.filter((b) => b.status !== 'CANCELLED').length;
            const boardedCount = trip.bookings.filter((b) => b.status === 'BOARDED').length;
            const isExpanded = selectedTrip === trip.id;

            return (
              <motion.div
                key={trip.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setSelectedTrip(isExpanded ? null : trip.id)}
                  className="flex w-full items-center justify-between p-5 text-start transition hover:bg-slate-50/60"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0066FF]">
                      <Bus className="size-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-[#0B1B33]">
                        {isRTL
                          ? `${trip.destination} ← ${trip.origin}`
                          : `${trip.origin} → ${trip.destination}`}
                      </h3>
                      <p className="text-xs font-semibold text-slate-500 mt-0.5">
                        {trip.bus?.name || 'Bus'} •{' '}
                        {typeof trip.departure === 'string'
                          ? new Date(trip.departure).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-blue-50 px-3 py-1 text-xs font-bold text-[#0066FF]">
                      {bookedCount} {isRTL ? 'محجوز' : 'Booked'}
                    </span>
                    <span className="rounded-xl bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">
                      {boardedCount} {isRTL ? 'صعد' : 'Boarded'}
                    </span>
                    <span className="text-slate-400 font-bold text-lg">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/40 p-5">
                    {trip.bookings.length === 0 ? (
                      <p className="py-4 text-center text-xs font-bold text-slate-400">
                        {isRTL ? 'لا توجد حجوزات في هذه الرحلة' : 'No passenger bookings on this trip'}
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/70 bg-white">
                        {trip.bookings.map((booking) => {
                          const isBoarded = booking.status === 'BOARDED';
                          const isCancelled = booking.status === 'CANCELLED';

                          return (
                            <div
                              key={booking.id}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 transition hover:bg-slate-50/50"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    'size-2.5 rounded-full shrink-0',
                                    isBoarded
                                      ? 'bg-emerald-500 ring-4 ring-emerald-100'
                                      : isCancelled
                                      ? 'bg-rose-500'
                                      : 'bg-amber-500 ring-4 ring-amber-100'
                                  )}
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-[#0B1B33]">
                                      {booking.passengerName}
                                    </span>
                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-700">
                                      {isRTL ? 'مقعد' : 'Seat'} {booking.seatLabel}
                                    </span>
                                    {booking._type === 'companyBooking' && (
                                      <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                                        {isRTL ? 'شركة' : 'B2B'}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-mono font-medium text-slate-400 mt-0.5">
                                    {booking.reference}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 self-end sm:self-center">
                                {isBoarded ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                                    <CheckCircle2 className="size-4" />
                                    {isRTL ? 'تم الصعود' : 'Boarded'}
                                  </span>
                                ) : isCancelled ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">
                                    <XCircle className="size-4" />
                                    {isRTL ? 'حجز ملغي' : 'Cancelled'}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => markBoarded(booking)}
                                    disabled={boardingId === booking.id}
                                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition disabled:opacity-50"
                                  >
                                    {boardingId === booking.id ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="size-3.5" />
                                    )}
                                    {isRTL ? 'تأكيد الصعود' : 'Confirm Boarding'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
