'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Route, Bus, MapPin, CheckCircle2, Clock, ArrowLeft, Search, Loader2, Armchair, RefreshCw,
  LogOut, Shield, ChevronRight, User,
} from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { toast } from 'sonner';
import { signOut } from 'next-auth/react';
import { V2Logo } from '@/components/v2/Logo';
import { V2EmptyState } from '@/components/v2/ui';

interface Seat {
  id: string;
  label: string;
  row: number;
  col: number;
  type: string;
  price: number;
}

interface Booking {
  id: string;
  reference: string;
  seatLabel: string;
  passengerName: string;
  status: string;
  total: number;
  paidAt: string | null;
  boarded: boolean;
  boardedAt: string | null;
  user?: { id: string; name: string; email: string };
}

interface CompanyBooking {
  id: string;
  reference: string;
  seatLabel: string;
  passengerName: string;
  status: string;
  total: number;
  boardedAt: string | null;
  company?: { id: string; name: string };
}

interface Trip {
  id: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  status: string;
  bus: {
    id: string;
    name: string;
    type: string;
    seatCount: number;
    layout?: {
      rows: number;
      cols: number;
      aisleAfter: number;
      colsPerRow: string;
      seats: Seat[];
    };
  };
  bookings: Booking[];
  companyBookings?: CompanyBooking[];
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];

export default function SupervisorStationPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [search, setSearch] = useState('');
  const [boardingId, setBoardingId] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!session?.user) {
      router.replace('/login');
      return;
    }
    if (session.user.role === 'CUSTOMER') {
      router.replace('/trips');
      return;
    }
    fetchTrips();
  }, [session, authStatus, router]);

  async function fetchTrips() {
    setLoading(true);
    try {
      const res = await fetch('/api/trips?all=true&take=50');
      const json = await res.json();
      setTrips(json.data || json.trips || []);
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTrip(tripId: string) {
    setSelectedTrip(null);
    setSelectedSeat(null);
    try {
      const res = await fetch(`/api/trips/${tripId}`);
      if (res.ok) setSelectedTrip(await res.json());
    } catch {
      toast.error(isRTL ? 'تعذر تحميل بيانات الرحلة' : 'Failed to load trip details');
    }
  }

  async function markBoarded(bookingId: string, isCompany: boolean) {
    setBoardingId(bookingId);
    try {
      const url = isCompany ? `/api/company/bookings/${bookingId}` : `/api/bookings/${bookingId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'BOARDED' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || err.message || (isRTL ? 'فشل تأكيد الصعود' : 'Failed to confirm boarding'));
        return;
      }
      setSelectedTrip((prev) => {
        if (!prev) return prev;
        if (isCompany) {
          return {
            ...prev,
            companyBookings: (prev.companyBookings || []).map((b) =>
              b.id === bookingId ? { ...b, status: 'BOARDED', boardedAt: new Date().toISOString() } : b
            ),
          };
        }
        return {
          ...prev,
          bookings: prev.bookings.map((b) =>
            b.id === bookingId ? { ...b, boarded: true, status: 'BOARDED', boardedAt: new Date().toISOString() } : b
          ),
        };
      });
      toast.success(isRTL ? 'تم تأكيد صعود الراكب' : 'Boarding confirmed');
    } finally {
      setBoardingId(null);
    }
  }

  const filteredTrips = trips.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.origin.toLowerCase().includes(q) ||
      t.destination.toLowerCase().includes(q) ||
      t.bus?.name?.toLowerCase().includes(q)
    );
  });

  // Seat map calculation
  const layout = selectedTrip?.bus?.layout;
  const bookedMap = new Map<string, any>();
  if (selectedTrip) {
    for (const b of selectedTrip.bookings || []) {
      bookedMap.set(b.seatLabel, { ...b, _type: 'customer' });
    }
    for (const cb of selectedTrip.companyBookings || []) {
      if (!bookedMap.has(cb.seatLabel)) {
        bookedMap.set(cb.seatLabel, {
          ...cb,
          _type: 'company',
          boarded: cb.status === 'BOARDED',
          user: { id: '', name: cb.company?.name || cb.passengerName || 'Company Passenger', email: '' },
        });
      }
    }
  }

  function getSeatAt(rowIdx: number, col: number) {
    return layout?.seats?.find((s) => s.row === rowIdx && s.col === col);
  }

  function getRowSeatCount(rowLetter: string): number {
    if (layout?.colsPerRow) {
      try {
        const p = JSON.parse(layout.colsPerRow);
        return p[rowLetter] || layout.cols || 4;
      } catch {}
    }
    return layout?.cols || 4;
  }

  const selectedBooking = selectedSeat ? bookedMap.get(selectedSeat.label) : null;

  if (authStatus === 'loading' || (loading && !selectedTrip && trips.length === 0)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A1E3C]">
        <Loader2 className="size-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <V2Logo height={32} />
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-700 border border-emerald-200">
                {isRTL ? 'محطة الإشراف' : 'Supervisor Station'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs font-bold text-slate-500">
              {session?.user?.name}
            </span>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-rose-600 transition"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">{isRTL ? 'خروج' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {!selectedTrip ? (
          /* List of Trips */
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-[#0B1B33]">
                  {isRTL ? 'رحلات اليوم وجداول الحافلات' : "Today's Trip Manifest"}
                </h1>
                <p className="text-sm font-semibold text-slate-500">
                  {isRTL ? 'اختر رحلة لعرض خريطة المقاعد وتأكيد ركاب الباص' : 'Select a trip to open live bus layout & boarding desk'}
                </p>
              </div>

              <button
                type="button"
                onClick={fetchTrips}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm transition"
              >
                <RefreshCw className="size-4" />
                {isRTL ? 'تحديث الرحلات' : 'Refresh'}
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isRTL ? 'بحث بالمدينة أو اسم الباص...' : 'Search origin, destination, or bus name...'}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-[#0B1B33] placeholder:text-slate-400 focus:border-[#0066FF] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20"
              />
            </div>

            {filteredTrips.length === 0 ? (
              <V2EmptyState
                title={isRTL ? 'لا توجد رحلات' : 'No trips available'}
                desc={isRTL ? 'لا توجد رحلات مجدولة مطابقة للبحث حالياً.' : 'No scheduled trips matched your criteria.'}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTrips.map((trip, idx) => {
                  const allBookings = [...(trip.bookings || []), ...(trip.companyBookings || [])];
                  const bookedCount = allBookings.filter((b) => b.status !== 'CANCELLED').length;
                  const boardedCount = allBookings.filter((b) => b.status === 'BOARDED').length;
                  const totalSeats = trip.bus?.seatCount || 0;

                  return (
                    <motion.button
                      key={trip.id}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      onClick={() => loadTrip(trip.id)}
                      className="group rounded-2xl border border-slate-200/90 bg-white p-5 text-start shadow-sm transition hover:border-[#0066FF]/60 hover:shadow-md"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0066FF] group-hover:bg-[#0066FF] group-hover:text-white transition">
                          <Bus className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-base font-extrabold text-[#0B1B33]">
                            {isRTL ? `${trip.destination} ← ${trip.origin}` : `${trip.origin} → ${trip.destination}`}
                          </h3>
                          <p className="truncate text-xs font-semibold text-slate-500">
                            {trip.bus?.name || 'Bus'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-bold">
                        <span className="flex items-center gap-1 text-slate-500">
                          <Clock className="size-3.5" />
                          {formatTime(trip.departure)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-blue-700">
                            {bookedCount}/{totalSeats} {isRTL ? 'محجوز' : 'Booked'}
                          </span>
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700">
                            {boardedCount} {isRTL ? 'صعد' : 'Boarded'}
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Interactive Bus Seat Map View */
          <div className="space-y-6">
            {/* Top Bar with Back and Info */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTrip(null);
                    setSelectedSeat(null);
                  }}
                  className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition"
                >
                  <ArrowLeft className="size-5" />
                </button>
                <div>
                  <h2 className="text-lg font-black text-[#0B1B33]">
                    {isRTL
                      ? `${selectedTrip.destination} ← ${selectedTrip.origin}`
                      : `${selectedTrip.origin} → ${selectedTrip.destination}`}
                  </h2>
                  <p className="text-xs font-semibold text-slate-500">
                    {selectedTrip.bus?.name} • {formatDate(selectedTrip.departure)} {formatTime(selectedTrip.departure)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => loadTrip(selectedTrip.id)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                <RefreshCw className="size-4" />
                {isRTL ? 'تحديث' : 'Refresh'}
              </button>
            </div>

            {/* Quick KPI stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                <p className="text-xs font-bold text-slate-500 mb-1">{isRTL ? 'إجمالي المحجوز' : 'Booked'}</p>
                <p className="text-2xl font-black text-[#0066FF]">{bookedMap.size} / {selectedTrip.bus?.seatCount || 0}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                <p className="text-xs font-bold text-slate-500 mb-1">{isRTL ? 'المقاعد الشاغرة' : 'Available'}</p>
                <p className="text-2xl font-black text-slate-600">
                  {Math.max(0, (selectedTrip.bus?.seatCount || 0) - bookedMap.size)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                <p className="text-xs font-bold text-slate-500 mb-1">{isRTL ? 'صعدوا الحافلة' : 'Boarded'}</p>
                <p className="text-2xl font-black text-emerald-600">
                  {[...bookedMap.values()].filter((b: any) => b.status === 'BOARDED').length}
                </p>
              </div>
            </div>

            {/* Layout & Detail Container */}
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Bus Seat Map Visualizer */}
              <div className="flex-1 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                {/* Front of Bus indicator */}
                <div className="mb-6 flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-5 py-2 text-xs font-black text-slate-600 shadow-inner">
                    <span>🚌</span>
                    <span>{isRTL ? 'مقدمة الباص والسائق' : 'FRONT / DRIVER'}</span>
                  </div>
                </div>

                {/* Column Headers */}
                <div className="mb-3 flex justify-center gap-2.5 pl-8">
                  {Array.from({ length: layout?.cols || 4 }, (_, i) => (
                    <div key={i} className="size-11 text-center text-xs font-extrabold text-slate-400 flex items-center justify-center">
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Rows & Seats */}
                <div className="flex flex-col items-center gap-2">
                  {Array.from({ length: layout?.rows || 10 }, (_, rowIdx) => {
                    const rowLetter = ROWS[rowIdx] || `R${rowIdx + 1}`;
                    const rowSeatCount = getRowSeatCount(rowLetter);
                    const aislePos = layout?.aisleAfter ?? 2;

                    return (
                      <div key={rowIdx} className="flex items-center gap-2.5">
                        <div className="w-6 text-center text-xs font-black text-slate-400">
                          {rowLetter}
                        </div>
                        {Array.from({ length: rowSeatCount }, (_, colIdx) => {
                          const col = colIdx + 1;
                          const seat = getSeatAt(rowIdx, col);
                          const isAisle = col === aislePos + 1 && rowSeatCount > 3;
                          const booking = seat ? bookedMap.get(seat.label) : null;
                          const isBoarded = booking?.boarded || booking?.status === 'BOARDED';
                          const isSelected = selectedSeat?.id === seat?.id;
                          const isToilet = seat?.type === 'TOILET';

                          return (
                            <div
                              key={colIdx}
                              className={cn('flex gap-2.5', isAisle && (isRTL ? 'mr-8' : 'ml-8'))}
                            >
                              {seat ? (
                                <button
                                  type="button"
                                  onClick={() => !isToilet && setSelectedSeat(seat)}
                                  className={cn(
                                    'relative size-12 rounded-xl flex flex-col items-center justify-center text-xs font-black transition-all shadow-sm',
                                    isToilet
                                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                      : isBoarded
                                      ? 'bg-emerald-500 text-white shadow-emerald-200'
                                      : booking
                                      ? 'bg-[#0066FF] text-white shadow-blue-200'
                                      : seat.type === 'VIP'
                                      ? 'border-2 border-amber-400 bg-amber-50 text-amber-800'
                                      : 'border border-slate-200 bg-white text-slate-700 hover:border-[#0066FF]',
                                    isSelected && 'ring-4 ring-emerald-400 ring-offset-2'
                                  )}
                                >
                                  <span>{isToilet ? '🚻' : seat.label}</span>
                                  {booking && !isToilet && (
                                    <span className="truncate max-w-[40px] text-[8px] font-bold opacity-90">
                                      {(booking.passengerName || booking.user?.name || '').split(' ')[0]}
                                    </span>
                                  )}
                                  {isBoarded && (
                                    <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-white text-emerald-600 flex items-center justify-center shadow">
                                      <CheckCircle2 className="size-3" />
                                    </span>
                                  )}
                                </button>
                              ) : (
                                <div className="size-12" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-5 text-xs font-bold">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                    <span className="size-2 rounded-full bg-slate-300" />
                    {isRTL ? 'متاح' : 'Available'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-[#0066FF]">
                    <span className="size-2 rounded-full bg-[#0066FF]" />
                    {isRTL ? 'محجوز' : 'Booked'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    {isRTL ? 'تم الصعود' : 'Boarded'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-amber-800 border border-amber-200">
                    <span className="size-2 rounded-full bg-amber-400" />
                    VIP
                  </span>
                </div>
              </div>

              {/* Passenger Detail Sidebar */}
              <div className="w-full lg:w-80 shrink-0">
                <div className="sticky top-20 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  {!selectedSeat ? (
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                        <Armchair className="size-7" />
                      </div>
                      <p className="text-sm font-bold text-slate-500">
                        {isRTL ? 'اضغط على مقعد لعرض بيانات الراكب' : 'Click any seat to view passenger manifest'}
                      </p>
                    </div>
                  ) : !selectedBooking ? (
                    <div className="space-y-4 text-center">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="text-2xl font-black text-[#0B1B33]">{selectedSeat.label}</h3>
                        {selectedSeat.type === 'VIP' && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-black text-amber-800">
                            VIP
                          </span>
                        )}
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-6 text-center">
                        <p className="text-sm font-bold text-slate-600">
                          {isRTL ? 'هذا المقعد شاغر ولم يُحجز بعد.' : 'This seat is free and unreserved.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <span className="text-2xl font-black font-mono text-[#0B1B33]">
                          {selectedSeat.label}
                        </span>
                        {selectedBooking.status === 'BOARDED' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                            <CheckCircle2 className="size-3.5" />
                            {isRTL ? 'صعد الحافلة' : 'Boarded'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                            <Clock className="size-3.5" />
                            {isRTL ? 'في الانتظار' : 'Waiting'}
                          </span>
                        )}
                      </div>

                      <div className="text-center">
                        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0066FF] font-black text-lg">
                          {(selectedBooking.passengerName || selectedBooking.user?.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <h4 className="text-base font-extrabold text-[#0B1B33]">
                          {selectedBooking.passengerName || selectedBooking.user?.name}
                        </h4>
                        <p className="text-xs font-mono font-bold text-slate-400 mt-0.5">
                          {selectedBooking.reference}
                        </p>
                      </div>

                      <div className="space-y-2 border-t border-slate-100 pt-3 text-xs font-semibold">
                        <div className="flex justify-between">
                          <span className="text-slate-500">{isRTL ? 'الجهة' : 'Type'}</span>
                          <span className="font-bold text-[#0B1B33]">
                            {selectedBooking._type === 'company' ? (isRTL ? 'حجز شركة' : 'Corporate') : (isRTL ? 'حجز فردي' : 'Individual')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">{isRTL ? 'المبلغ' : 'Total'}</span>
                          <span className="font-bold text-[#0B1B33]">{selectedBooking.total} ج.م</span>
                        </div>
                      </div>

                      {selectedBooking.status !== 'BOARDED' && (
                        <button
                          type="button"
                          onClick={() =>
                            markBoarded(selectedBooking.id, selectedBooking._type === 'company')
                          }
                          disabled={boardingId === selectedBooking.id}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-black text-white hover:bg-emerald-700 shadow-md transition disabled:opacity-50"
                        >
                          {boardingId === selectedBooking.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="size-4" />
                          )}
                          {isRTL ? 'تأكيد الصعود للمقعد' : 'Confirm Passenger Boarded'}
                        </button>
                      )}

                      {selectedBooking.status === 'BOARDED' && selectedBooking.boardedAt && (
                        <div className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-bold text-emerald-800 border border-emerald-200">
                          {isRTL ? 'صعد الراكب في: ' : 'Boarded at: '}
                          {new Date(selectedBooking.boardedAt).toLocaleTimeString(
                            isRTL ? 'ar-EG' : 'en-US',
                            { hour: '2-digit', minute: '2-digit' }
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
