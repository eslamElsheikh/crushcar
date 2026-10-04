'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Clock, MapPin, Loader2, Check, Bus, Sparkles, X,
  User, Repeat, Map, Navigation, Ticket, Phone, Printer, Building2, FileText, Banknote, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2Skeleton } from '@/components/v2/ui';

interface Seat {
  id: string;
  label: string;
  row: number;
  col: number;
  type: string;
  price: number;
}

interface TripStop {
  id?: string;
  tripId?: string;
  stationId: string;
  station?: { id: string; name: string; city: string };
  stopOrder: number;
  priceFromOrigin: number;
  arrivalTime?: string;
  departureTime?: string;
}

interface Trip {
  id: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  price: number;
  status: string;
  tripStops: TripStop[];
  bus: {
    id: string;
    name: string;
    type: string;
    stations?: { id: string; name: string; order: number }[];
    layout?: {
      rows: number;
      cols: number;
      aisleAfter: number;
      colsPerRow: string;
      seats: Seat[];
    };
  };
  bookings: { seatLabel: string; fromStopOrder?: number; toStopOrder?: number }[];
  companyBookings?: { seatLabel: string; fromStopOrder?: number; toStopOrder?: number }[];
  seatBlocks?: { seatLabel: string }[];
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];

function TripDetailPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tripId = params.id as string;
  const returnTripId = searchParams.get('returnTripId');
  const urlFromStationId = searchParams.get('fromStationId');
  const urlToStationId = searchParams.get('toStationId');
  const { data: session } = useSession();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [trip, setTrip] = useState<Trip | null>(null);
  const returnSectionRef = useRef<HTMLDivElement>(null);
  const [returnTrip, setReturnTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [returnSelectedSeats, setReturnSelectedSeats] = useState<string[]>([]);
  const [passenger, setPassenger] = useState({
    name: '',
    phone: '',
    hotel: '',
    notes: '',
    collectAmount: '' as string,
  });
  const [booking, setBooking] = useState(false);
  const [showReturnSeats, setShowReturnSeats] = useState(false);
  const [confirmedBookings, setConfirmedBookings] = useState<any[]>([]);
  const [lastToast, setLastToast] = useState<string>('');

  // Stop selection
  const [fromStationId, setFromStationId] = useState<string | null>(urlFromStationId);
  const [toStationId, setToStationId] = useState<string | null>(urlToStationId);

  const loadTrip = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}`);
      if (res.ok) {
        const data = await res.json();
        setTrip(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  const loadReturnTrip = useCallback(async () => {
    if (!returnTripId) return;
    try {
      const res = await fetch(`/api/trips/${returnTripId}`);
      if (res.ok) {
        const data = await res.json();
        setReturnTrip(data);
      }
    } catch {}
  }, [returnTripId]);

  useEffect(() => {
    loadTrip();
    if (returnTripId) loadReturnTrip();
  }, [loadTrip, loadReturnTrip, returnTripId]);

  // Realtime polling
  useEffect(() => {
    const interval = setInterval(loadTrip, 5000);
    if (returnTripId) {
      const returnInterval = setInterval(loadReturnTrip, 5000);
      return () => { clearInterval(interval); clearInterval(returnInterval); };
    }
    return () => clearInterval(interval);
  }, [loadTrip, loadReturnTrip, returnTripId]);

  // Sorted stops ascending
  const sortedStops = useMemo(() => {
    return [...(trip?.tripStops || [])].sort((a, b) => a.stopOrder - b.stopOrder);
  }, [trip?.tripStops]);

  // Auto-select first/last stops on initial load
  useEffect(() => {
    if (!trip || sortedStops.length === 0) return;
    const firstStopId = sortedStops[0]?.stationId;
    const lastStopId = sortedStops[sortedStops.length - 1]?.stationId;

    if (!fromStationId || !sortedStops.some(s => s.stationId === fromStationId)) {
      setFromStationId(firstStopId);
    }
    if (!toStationId || !sortedStops.some(s => s.stationId === toStationId)) {
      setToStationId(lastStopId);
    }
  }, [trip, sortedStops, fromStationId, toStationId]);

  // Current stops objects
  const fromStop = useMemo(() => {
    return sortedStops.find(s => s.stationId === fromStationId) || sortedStops[0];
  }, [sortedStops, fromStationId]);

  const toStop = useMemo(() => {
    return sortedStops.find(s => s.stationId === toStationId) || sortedStops[sortedStops.length - 1];
  }, [sortedStops, toStationId]);

  // Boarding Station Options:
  // RULE: The last station (e.g. Aswan in Alex -> Cairo -> Aswan) CAN NEVER be a boarding station!
  const boardingOptions = useMemo(() => {
    if (sortedStops.length <= 1) return [];
    const lastStopOrder = sortedStops[sortedStops.length - 1].stopOrder;
    return sortedStops.filter((s) => s.stopOrder < lastStopOrder);
  }, [sortedStops]);

  // Alighting Station Options:
  // RULE: The first station (e.g. Alex) CAN NEVER be an alighting station!
  // And alighting must be strictly after the selected fromStationId.
  const alightingOptions = useMemo(() => {
    if (sortedStops.length <= 1) return [];
    const currentFromOrder = fromStop?.stopOrder ?? sortedStops[0].stopOrder;
    return sortedStops.filter((s) => s.stopOrder > currentFromOrder);
  }, [sortedStops, fromStop]);

  // Handlers for changing stops with automatic validation & adjustment
  function handleBoardingChange(newFromId: string) {
    setFromStationId(newFromId);
    const newFrom = sortedStops.find(s => s.stationId === newFromId);
    if (!newFrom) return;

    // If current toStationId is not strictly after newFrom, adjust it
    if (!toStop || toStop.stopOrder <= newFrom.stopOrder) {
      const nextValid = sortedStops.find(s => s.stopOrder > newFrom.stopOrder);
      if (nextValid) setToStationId(nextValid.stationId);
    }
  }

  function handleAlightingChange(newToId: string) {
    setToStationId(newToId);
    const newTo = sortedStops.find(s => s.stationId === newToId);
    if (!newTo) return;

    // If current fromStationId is not strictly before newTo, adjust it
    if (!fromStop || fromStop.stopOrder >= newTo.stopOrder) {
      const prevValid = [...sortedStops].reverse().find(s => s.stopOrder < newTo.stopOrder);
      if (prevValid) setFromStationId(prevValid.stationId);
    }
  }

  // Segment price recalculation
  const segmentPrice = useMemo(() => {
    if (fromStop && toStop && toStop.stopOrder > fromStop.stopOrder) {
      const diff = (toStop.priceFromOrigin ?? 0) - (fromStop.priceFromOrigin ?? 0);
      if (diff > 0) return diff;
    }
    return trip?.price ?? 0;
  }, [fromStop, toStop, trip?.price]);

  // Realtime collision eviction
  useEffect(() => {
    if (!trip) return;
    const allReserved = new Set([
      ...(trip.bookings || []).map((b: any) => b.seatLabel),
      ...(trip.companyBookings || []).map((b: any) => b.seatLabel),
      ...(trip.seatBlocks || []).map((b: any) => b.seatLabel),
    ]);
    const nowReserved = selectedSeats.filter((s) => allReserved.has(s));
    if (nowReserved.length > 0) {
      const msg = `${t('seat.reserved')} ${nowReserved[0]}`;
      if (msg !== lastToast) {
        setSelectedSeats((prev) => prev.filter((s) => !allReserved.has(s)));
        toast.error(msg);
        setLastToast(msg);
      }
    }
  }, [trip, t, selectedSeats, lastToast]);

  useEffect(() => {
    if (!returnTrip) return;
    const allReserved = new Set([
      ...(returnTrip.bookings || []).map((b: any) => b.seatLabel),
      ...(returnTrip.companyBookings || []).map((b: any) => b.seatLabel),
      ...(returnTrip.seatBlocks || []).map((b: any) => b.seatLabel),
    ]);
    const nowReserved = returnSelectedSeats.filter((s) => allReserved.has(s));
    if (nowReserved.length > 0) {
      const msg = `${t('seat.reserved')} ${nowReserved[0]}`;
      if (msg !== lastToast) {
        setReturnSelectedSeats((prev) => prev.filter((s) => !allReserved.has(s)));
        toast.error(msg);
        setLastToast(msg);
      }
    }
  }, [returnTrip, t, returnSelectedSeats, lastToast]);

  // Determine unavailable seats
  function getUnavailableSeatsForSegment(t: Trip | null, fromSid: string | null, toSid: string | null): Set<string> {
    if (!t) return new Set();
    const stops = [...(t.tripStops || [])].sort((a, b) => a.stopOrder - b.stopOrder);
    const allBookings = t.bookings || [];
    const allCompanyBookings = t.companyBookings || [];

    const addBookingsToSet = (bookings: { seatLabel: string; fromStopOrder?: number; toStopOrder?: number }[]) => {
      if (stops.length === 0) {
        return new Set(bookings.map(b => b.seatLabel));
      }

      const fStop = stops.find(s => s.stationId === fromSid);
      const tStop = stops.find(s => s.stationId === toSid);
      const fOrder = fStop?.stopOrder ?? 1;
      const tOrder = tStop?.stopOrder ?? stops.length;
      if (fOrder >= tOrder) return new Set(bookings.map(b => b.seatLabel));

      const taken = new Set<string>();
      for (const b of bookings) {
        const bFrom = b.fromStopOrder ?? fOrder;
        const bTo = b.toStopOrder ?? tOrder;
        if (bFrom < tOrder && bTo > fOrder) {
          taken.add(b.seatLabel);
        }
      }
      return taken;
    };

    const takenFromBookings = addBookingsToSet(allBookings);
    const takenFromCompany = addBookingsToSet(allCompanyBookings);
    const takenFromBlocks = new Set((t.seatBlocks || []).map(b => b.seatLabel));

    return new Set([...takenFromBookings, ...takenFromCompany, ...takenFromBlocks]);
  }

  const reservedSeats = getUnavailableSeatsForSegment(trip, fromStationId, toStationId);
  const returnFromStationId = searchParams.get('returnFromStationId') || null;
  const returnToStationId = searchParams.get('returnToStationId') || null;
  const returnReservedSeats = getUnavailableSeatsForSegment(returnTrip, returnFromStationId, returnToStationId);
  const layout = trip?.bus?.layout;
  const returnLayout = returnTrip?.bus?.layout;

  function toggleSeat(label: string) {
    if (reservedSeats.has(label)) return;
    setSelectedSeats((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  }

  function toggleReturnSeat(label: string) {
    if (returnReservedSeats.has(label)) return;
    setReturnSelectedSeats((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  }

  function scrollToReturn() {
    setShowReturnSeats(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        returnSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  async function handleHold() {
    if (selectedSeats.length === 0) return;
    if (!session) {
      toast.error(isRTL ? 'سجل دخول أولاً' : 'Please sign in first');
      router.push('/login');
      return;
    }
    await proceedToPayment();
  }

  async function proceedToPayment() {
    if (!session) {
      toast.error(isRTL ? 'سجل دخول أولاً' : 'Please sign in first');
      router.push('/login');
      return;
    }
    setBooking(true);

    const tripStopsList = sortedStops;
    const outboundFromId = fromStationId || tripStopsList[0]?.stationId || null;
    const outboundToId = toStationId || tripStopsList[tripStopsList.length - 1]?.stationId || null;
    const isDirectTrip = tripStopsList.length === 0;

    if (!isDirectTrip && (!outboundFromId || !outboundToId)) {
      toast.error(isRTL ? 'اختر محطات الصعود والنزول' : 'Select boarding and alighting stations');
      setBooking(false);
      return;
    }

    const resolvedName = passenger.name?.trim() || session.user?.name || '';
    const resolvedPhone = passenger.phone?.trim() || '';
    const resolvedHotel = passenger.hotel?.trim() || '';
    const resolvedNotes = passenger.notes?.trim() || '';
    const resolvedCollectRaw = passenger.collectAmount?.toString().trim() || '';
    const resolvedCollect = resolvedCollectRaw ? Number(resolvedCollectRaw) : null;

    const seats = selectedSeats.map((seatLabel) => ({
      seatLabel,
      passengerName: resolvedName,
      passengerPhone: resolvedPhone,
      passengerHotel: resolvedHotel,
      passengerNotes: resolvedNotes,
      collectAmount: resolvedCollect,
      fromStationId: isDirectTrip ? null : outboundFromId,
      toStationId: isDirectTrip ? null : outboundToId,
    }));

    const returnTripStops = [...(returnTrip?.tripStops || [])].sort((a, b) => a.stopOrder - b.stopOrder);
    const returnFromId = searchParams.get('returnFromStationId') || returnTripStops[0]?.stationId || undefined;
    const returnToId = searchParams.get('returnToStationId') || returnTripStops[returnTripStops.length - 1]?.stationId || undefined;
    const returnSeats = returnTripId && returnFromId && returnToId ? returnSelectedSeats.map((seatLabel) => ({
      seatLabel,
      passengerName: resolvedName,
      passengerPhone: resolvedPhone,
      passengerHotel: resolvedHotel,
      passengerNotes: resolvedNotes,
      collectAmount: resolvedCollect,
      fromStationId: returnFromId,
      toStationId: returnToId,
    })) : undefined;

    try {
      const allSeats = [...seats, ...(returnSeats || [])];
      const confirmed: any[] = [];

      // COMPANY_ADMIN: use company booking endpoint (batch per trip)
      if (session.user.role === 'COMPANY_ADMIN') {
        const outboundPassengers = seats.map(s => ({
          seatLabel: s.seatLabel,
          passengerName: s.passengerName,
          passengerPhone: s.passengerPhone,
          passengerHotel: s.passengerHotel,
          passengerNotes: s.passengerNotes,
          collectAmount: s.collectAmount,
          fromStationId: s.fromStationId,
          toStationId: s.toStationId,
        }));
        const returnPassengers = returnSeats ? returnSeats.map(s => ({
          seatLabel: s.seatLabel,
          passengerName: s.passengerName,
          passengerPhone: s.passengerPhone,
          passengerHotel: s.passengerHotel,
          passengerNotes: s.passengerNotes,
          collectAmount: s.collectAmount,
          fromStationId: s.fromStationId,
          toStationId: s.toStationId,
        })) : undefined;

        const groups: { tripId: string; passengers: typeof outboundPassengers }[] = [];
        if (outboundPassengers.length > 0 && tripId) groups.push({ tripId, passengers: outboundPassengers });
        if (returnPassengers && returnPassengers.length > 0 && returnTripId) groups.push({ tripId: returnTripId, passengers: returnPassengers });

        const hasRoundTrip = groups.length > 1;
        const roundTripGroupId = hasRoundTrip ? crypto.randomUUID() : undefined;

        let allOk = true;
        for (const group of groups) {
          const isGroupReturn = group.tripId === returnTripId;
          const groupFromId = isGroupReturn ? returnFromId : outboundFromId;
          const groupToId = isGroupReturn ? returnToId : outboundToId;
          const res = await fetch('/api/company/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tripId: group.tripId,
              passengers: group.passengers.map(p => ({
                seatLabel: p.seatLabel,
                passengerName: p.passengerName,
                passengerPhone: p.passengerPhone,
                passengerHotel: p.passengerHotel,
                passengerNotes: p.passengerNotes,
                collectAmount: p.collectAmount,
              })),
              bookingType: 'FOR_CLIENT',
              fromStationId: groupFromId || null,
              toStationId: groupToId || null,
              roundTripGroupId,
            }),
            credentials: 'include',
          });
          const data = await res.json();
          if (res.ok && data.bookings) {
            confirmed.push(...data.bookings);
          } else {
            allOk = false;
            if (res.status === 401) {
              toast.error(isRTL ? 'انتهت جلستك، يرجى تسجيل الدخول' : 'Session expired, please sign in');
              router.push('/login');
              break;
            }
            toast.error(data.error || t('common.error'));
          }
        }

        if (allOk && confirmed.length > 0) {
          setConfirmedBookings(confirmed);
          setSelectedSeats([]);
          setReturnSelectedSeats([]);
          setPassenger({ name: session.user?.name || '', phone: '', hotel: '', notes: '', collectAmount: '' });
          toast.success(isRTL ? 'تم الحجز بنجاح، تأكد من الدفع في صفحة الحجوزات' : 'Booked successfully, confirm payment in bookings page');
        }
      } else {
        // CUSTOMER: use regular booking endpoint (one per seat)
        const hasRoundTrip = !!(returnTripId && returnSeats);
        const customerRoundTripGroupId = hasRoundTrip ? crypto.randomUUID() : undefined;
        let successCount = 0;

        for (let i = 0; i < allSeats.length; i++) {
          const seat = allSeats[i];
          const isReturn = i >= seats.length;
          const targetTripId = isReturn ? returnTripId : tripId;
          if (!targetTripId) continue;

          const res = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tripId: targetTripId,
              seatLabel: seat.seatLabel,
              passengerName: seat.passengerName,
              passengerPhone: seat.passengerPhone,
              passengerHotel: seat.passengerHotel,
              passengerNotes: seat.passengerNotes,
              collectAmount: seat.collectAmount,
              fromStationId: seat.fromStationId,
              toStationId: seat.toStationId,
              roundTripGroupId: customerRoundTripGroupId,
            }),
            credentials: 'include',
          });
          const data = await res.json();
          if (res.ok) {
            successCount++;
            confirmed.push(data.booking);
          } else {
            if (res.status === 401) {
              toast.error(isRTL ? 'انتهت جلستك، يرجى تسجيل الدخول' : 'Session expired, please sign in');
              router.push('/login');
              break;
            }
            if (data.error === 'SEAT_TAKEN') {
              toast.error(isRTL ? `المقعد ${seat.seatLabel} محجوز` : `Seat ${seat.seatLabel} is taken`);
            } else {
              toast.error(data.error || t('common.error'));
            }
          }
        }

        if (successCount > 0) {
          setConfirmedBookings(confirmed);
          setSelectedSeats([]);
          setReturnSelectedSeats([]);
          setPassenger({ name: session.user?.name || '', phone: '', hotel: '', notes: '', collectAmount: '' });
        }
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBooking(false);
    }
  }

  function getSeatAt(rowIdx: number, col: number, seatsList?: Seat[]): Seat | undefined {
    return (seatsList || layout?.seats)?.find((s) => s.row === rowIdx && s.col === col);
  }

  const isRoundTrip = !!(returnTripId && returnTrip);

  const totalPrice = useMemo(() => {
    return selectedSeats.reduce((sum, label) => {
      const seat = layout?.seats?.find((s) => s.label === label);
      return sum + (segmentPrice || trip?.price || 0) + (seat?.price || 0);
    }, 0);
  }, [selectedSeats, layout?.seats, segmentPrice, trip?.price]);

  const returnTotalPrice = useMemo(() => {
    return returnSelectedSeats.reduce((sum, label) => {
      const seat = returnLayout?.seats?.find((s) => s.label === label);
      return sum + (returnTrip?.price || 0) + (seat?.price || 0);
    }, 0);
  }, [returnSelectedSeats, returnLayout?.seats, returnTrip?.price]);

  const seatsLeft = useMemo(() => {
    if (!trip) return 0;
    return (trip.bus?.layout?.seats?.filter(s => s.type !== 'TOILET')?.length || 0) - reservedSeats.size;
  }, [trip, reservedSeats]);

  if (loading) {
    return (
      <div className="v2 min-h-dvh bg-[var(--sp-bg)]" dir={isRTL ? 'rtl' : 'ltr'}>
        <V2SiteHeader />
        <main className="v2-container py-12">
          <div className="grid gap-4" role="status">
            <V2Skeleton className="h-10 w-64 rounded-xl" />
            <V2Skeleton className="h-[420px] rounded-2xl" />
          </div>
        </main>
        <V2SiteFooter />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="v2 min-h-dvh bg-[var(--sp-bg)]" dir={isRTL ? 'rtl' : 'ltr'}>
        <V2SiteHeader />
        <main className="v2-container py-16 text-center">
          <div className="max-w-md mx-auto bg-[var(--sp-card)] rounded-2xl border border-[var(--sp-line)] p-8 shadow-sm">
            <p className="text-lg font-extrabold text-[#0B1B33]">{t('trips.noTrips')}</p>
            <Link href="/trips" className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0A1E3C] text-white text-sm font-bold">
              {t('v2.back')}
            </Link>
          </div>
        </main>
        <V2SiteFooter />
      </div>
    );
  }

  return (
    <div className="v2 min-h-dvh bg-[var(--sp-bg)] text-[#0B1B33]" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ── TOP SITE HEADER ──────────────────────────── */}
      <V2SiteHeader />

      {/* Confirmation Modal Overlay */}
      <AnimatePresence>
        {confirmedBookings.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-[#0B1B33]/70 backdrop-blur-md" onClick={() => setConfirmedBookings([])} />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <ConfirmationCard
                t={t}
                isRTL={isRTL}
                confirmedBookings={confirmedBookings}
                trip={trip}
                formatDate={formatDate}
                formatTime={formatTime}
                onClose={() => setConfirmedBookings([])}
                onBookAnother={() => setConfirmedBookings([])}
                onViewBookings={() => router.push(session?.user?.role === 'COMPANY_ADMIN' ? '/company/bookings' : '/bookings')}
                sessionRole={session?.user?.role || ''}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="v2-container pb-20 pt-6 md:pt-8">
        {/* ── BREADCRUMB & ROUTE BANNER ──────────────── */}
        <div className="mb-6">
          <Link
            href="/trips"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--sp-text-muted)] hover:text-[#0B1B33] transition mb-3"
          >
            <ArrowRight className="size-4 rotate-180 v2-flip-rtl" />
            {isRTL ? 'الرجوع إلى قائمة الرحلات' : 'Back to trips list'}
          </Link>

          <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <V2StatusBadge tone={seatsLeft > 0 ? 'green' : 'red'}>
                  {seatsLeft > 0 ? `${seatsLeft} ${t('v2.seatsLeft')}` : t('v2.soldOut')}
                </V2StatusBadge>
                <V2StatusBadge tone="blue">
                  {sortedStops.length === 0 ? t('v2.direct') : `${sortedStops.length} ${t('v2.stops')}`}
                </V2StatusBadge>
                {trip.bus?.type && (
                  <V2StatusBadge tone="slate">{trip.bus.type}</V2StatusBadge>
                )}
              </div>
              <h1 className="text-2xl font-extrabold text-[#0B1B33] md:text-3xl flex items-center gap-2">
                <MapPin size={22} className="text-[#1D5BD8] shrink-0" />
                <span>{trip.origin}</span>
                <span className="text-slate-400 mx-1">{isRTL ? '←' : '→'}</span>
                <span>{trip.destination}</span>
              </h1>
              <p className="mt-1.5 text-xs text-[var(--sp-text-muted)] flex flex-wrap items-center gap-3 font-medium">
                <span className="flex items-center gap-1">
                  <Clock size={13} className="text-[#1D5BD8]" />
                  {formatDate(trip.departure)} · {formatTime(trip.departure)}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1">
                  <Bus size={13} className="text-[#1D5BD8]" />
                  {trip.bus?.name}
                </span>
              </p>
            </div>

            <div className="text-start md:text-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
              <span className="text-xs text-[var(--sp-text-muted)] block font-medium">{isRTL ? 'سعر التذكرة' : 'Ticket Price'}</span>
              <span className="text-2xl font-extrabold text-[#0B1B33]">
                {Number(segmentPrice || 0).toLocaleString()} <span className="text-xs font-bold text-[var(--sp-text-muted)]">{t('common.currency')}</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── STOP SELECTOR (Validated Boarding & Alighting) ── */}
        {sortedStops.length > 2 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6 mb-6 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-[#0B1B33] flex items-center gap-2">
                <Navigation size={16} className="text-[#1D5BD8]" />
                {isRTL ? 'تحديد محطات الصعود والنزول' : 'Select Boarding & Alighting Stations'}
              </h3>
              {fromStationId && toStationId && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  {Number(segmentPrice || 0).toLocaleString()} {t('common.currency')} {isRTL ? 'للمقعد' : '/ seat'}
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--sp-text-muted)] mb-2">
                  {isRTL ? 'محطة الصعود (البداية)' : 'Boarding Station (Start)'}
                </label>
                <select
                  value={fromStationId || ''}
                  onChange={(e) => handleBoardingChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[var(--sp-inset)] border border-[var(--sp-line)] text-[#0B1B33] text-sm font-semibold focus:outline-none focus:border-[#1D5BD8] focus:bg-[var(--sp-card)] transition"
                >
                  {boardingOptions.map((s) => (
                    <option key={s.stationId} value={s.stationId}>
                      {s.station?.name || s.stationId}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-[#9AA8BD]">
                  {isRTL ? 'لا يمكن اختيار المحطة النهائية كمحطة صعود' : 'Last station cannot be a boarding station'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--sp-text-muted)] mb-2">
                  {isRTL ? 'محطة النزول (الوجهة)' : 'Alighting Station (Destination)'}
                </label>
                <select
                  value={toStationId || ''}
                  onChange={(e) => handleAlightingChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[var(--sp-inset)] border border-[var(--sp-line)] text-[#0B1B33] text-sm font-semibold focus:outline-none focus:border-[#1D5BD8] focus:bg-[var(--sp-card)] transition"
                >
                  {alightingOptions.map((s) => (
                    <option key={s.stationId} value={s.stationId}>
                      {s.station?.name || s.stationId}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-[#9AA8BD]">
                  {isRTL ? 'تقتصر محطات النزول على المحطات التالية لمحطة الصعود' : 'Alighting stations must follow the boarding station'}
                </p>
              </div>
            </div>

            {fromStop && toStop && (
              <div className="mt-4 text-xs font-semibold text-[var(--sp-text-muted)] flex flex-wrap items-center gap-2 bg-[var(--sp-inset)] rounded-xl px-4 py-3 border border-slate-200/60">
                <MapPin size={13} className="text-[#1D5BD8]" />
                <span className="text-[#0B1B33] font-bold">{fromStop.station?.name || fromStationId}</span>
                <span className="text-slate-400">{isRTL ? '←' : '→'}</span>
                <span className="text-[#0B1B33] font-bold">{toStop.station?.name || toStationId}</span>
                <span className="text-slate-300 mx-1">•</span>
                <span className="text-emerald-600 font-extrabold">
                  {Number(segmentPrice || 0).toLocaleString()} {t('common.currency')}
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* ── MAIN CONTENT GRID (Seat Map + Booking Sidebar) ── */}
        <div className="grid lg:grid-cols-[1fr,360px] gap-6 items-start">
          {/* ── SEAT MAP CARD ──────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-6 sm:p-8 shadow-sm"
          >
            {/* Header & Legend */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-extrabold text-[#0B1B33]">
                  {t('seat.select')}
                </h2>
                <p className="text-xs text-[var(--sp-text-muted)] mt-0.5">
                  {trip.bus?.name} • {layout?.seats?.filter(s => s.type !== 'TOILET')?.length || 0} {t('layout.totalSeats')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--sp-seat-line)] bg-[var(--sp-seat-bg)] font-semibold text-[#0B1B33]">
                  <span className="size-3 rounded-md border border-[var(--sp-seat-line)] bg-[var(--sp-seat-bg)]" />
                  {t('seat.available')}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D5BD8] text-white font-bold">
                  <span className="size-3 rounded-md bg-white" />
                  {t('seat.selected')}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 font-semibold border border-slate-200">
                  <span className="size-3 rounded-md bg-slate-300" />
                  {t('seat.reserved')}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 font-bold border border-amber-300">
                  <span className="size-3 rounded-md bg-amber-400" />
                  {t('seat.vipSeat')}
                </span>
              </div>
            </div>

            {/* Bus front indicator */}
            <div className="flex items-center justify-center mb-6">
              <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-[var(--sp-inset)] border border-slate-200 text-[var(--sp-text-muted)] text-xs font-bold">
                <Bus size={15} className="text-[#1D5BD8]" />
                <span>{isRTL ? 'مقدمة الباص' : 'FRONT OF BUS'}</span>
              </div>
            </div>

            {/* Column numbers header */}
            <div className="flex flex-col items-center gap-1.5 mb-3">
              <div className="flex gap-2 items-center">
                <div className="w-8" />
                {(() => {
                  const aislePos = layout?.aisleAfter ?? 2;
                  const rowSeatCount = (() => {
                    if (layout?.colsPerRow) {
                      try {
                        const parsed = JSON.parse(layout.colsPerRow);
                        return parsed[ROWS[0]] || 4;
                      } catch { return 4; }
                    }
                    return layout?.cols || 4;
                  })();
                  return Array.from({ length: rowSeatCount }, (_, colIdx) => {
                    const col = colIdx + 1;
                    const isAisle = col === aislePos + 1 && rowSeatCount > 3;
                    return (
                      <div key={colIdx} className={cn('flex gap-2', isAisle ? 'ml-8' : '')}>
                        <div className="w-11 text-center text-xs text-slate-400 font-bold">{col}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Seat Grid */}
            <div className="flex flex-col items-center gap-2 overflow-x-auto pb-4">
              {Array.from({ length: layout?.rows || 10 }, (_, rowIdx) => {
                const rowLetter = ROWS[rowIdx];
                const rowSeatCount = (() => {
                  if (layout?.colsPerRow) {
                    try {
                      const parsed = JSON.parse(layout.colsPerRow);
                      return parsed[rowLetter] || 4;
                    } catch { return 4; }
                  }
                  return layout?.cols || 4;
                })();
                const aislePos = layout?.aisleAfter ?? 2;
                return (
                  <motion.div
                    key={rowIdx}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + rowIdx * 0.02 }}
                    className="flex gap-2 items-center"
                  >
                    <div className="w-8 flex items-center justify-center text-xs text-slate-400 font-extrabold">{rowLetter}</div>

                    {Array.from({ length: rowSeatCount }, (_, colIdx) => {
                      const col = colIdx + 1;
                      const seat = getSeatAt(rowIdx, col);
                      const isAisle = col === aislePos + 1 && rowSeatCount > 3;
                      const isSelected = selectedSeats.includes(seat?.label || '');
                      const isReserved = seat && reservedSeats.has(seat.label);

                      return (
                        <div key={colIdx} className={cn('flex gap-2', isAisle ? 'ml-8' : '')}>
                          {seat ? (
                            <SeatButton
                              seat={seat}
                              isSelected={isSelected}
                              isReserved={isReserved}
                              onToggle={toggleSeat}
                              tripPrice={segmentPrice || trip?.price || 0}
                              t={t}
                            />
                          ) : (
                            <div className="w-11 h-11" />
                          )}
                        </div>
                      );
                    })}
                  </motion.div>
                );
              })}
            </div>

            {/* Aisle label footer */}
            <div className="flex justify-center mt-4">
              <span className="text-[11px] text-[#9AA8BD] uppercase tracking-wider font-bold">
                {isRTL ? 'الممر' : 'AISLE'}
              </span>
            </div>
          </motion.div>

          {/* ── BOOKING SIDEBAR ──────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-6 shadow-sm sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-hide">
              {isRoundTrip && (
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                  <Repeat size={14} className="text-[#1D5BD8]" />
                  <span className="text-xs font-bold text-[#1D5BD8] bg-blue-50 px-3 py-1 rounded-full">
                    {t('roundtrip.bothLegs')}
                  </span>
                </div>
              )}

              <h3 className="font-extrabold text-lg text-[#0B1B33]">
                {isRoundTrip ? t('roundtrip.outboundTrip') : t('seat.summary')}
              </h3>
              <p className="text-xs text-[var(--sp-text-muted)] mb-5">{t('search.desc')}</p>

              {/* Route timeline stops */}
              <div className="space-y-3 mb-5 text-sm">
                {sortedStops.map((stop, idx) => {
                  const isFrom = stop.stationId === fromStationId;
                  const isTo = stop.stationId === toStationId;
                  const isSelected = isFrom || isTo;
                  return (
                    <div key={stop.stationId || idx} className="flex items-center gap-3">
                      <div className={cn(
                        'size-3 rounded-full shrink-0 border-2',
                        isSelected ? 'border-[#1D5BD8] bg-[#1D5BD8] shadow-[0_0_8px_rgba(29,91,216,0.5)]' : 'border-[var(--sp-seat-line)] bg-[var(--sp-seat-bg)]'
                      )} />
                      <div className={cn(isSelected ? '' : 'opacity-70')}>
                        <p className={cn(
                          'text-sm',
                          isSelected ? 'font-bold text-[#0B1B33]' : 'text-[var(--sp-text-muted)]'
                        )}>
                          {stop.station?.name || stop.stationId}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {stop.arrivalTime && `${stop.arrivalTime.slice(0, 5)}`}
                          {stop.arrivalTime && stop.departureTime ? ' – ' : ''}
                          {stop.departureTime && stop.departureTime.slice(0, 5)}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="ms-auto text-[10px] font-bold uppercase tracking-wider text-[#1D5BD8] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                          {isFrom ? (isRTL ? 'صعود' : 'BOARD') : (isRTL ? 'نزول' : 'ALIGHT')}
                        </span>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center gap-2 text-xs text-[var(--sp-text-muted)] pt-2 border-t border-slate-100">
                  <Clock size={12} className="text-[#1D5BD8]" />
                  {formatTime(trip.departure)} – {formatTime(trip.arrival)}
                  <span className="text-slate-300">•</span>
                  <Bus size={12} className="text-[#1D5BD8]" />
                  {trip.bus?.name}
                </div>
              </div>

              {/* Selected seats list */}
              <div className="mb-5">
                <h4 className="text-xs font-bold text-[var(--sp-text-muted)] mb-3 uppercase tracking-wider">
                  {t('seat.selectedSeats')} ({selectedSeats.length})
                </h4>
                {selectedSeats.length === 0 ? (
                  <p className="text-xs text-[#9AA8BD] flex items-center gap-2 py-4 justify-center bg-[var(--sp-inset)] rounded-xl border border-dashed border-slate-200">
                    <span className="text-base">🪑</span>
                    {t('seat.clickSeat')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <AnimatePresence>
                      {selectedSeats.map((label) => {
                        const seat = layout?.seats?.find((s) => s.label === label);
                        const price = (segmentPrice || trip?.price || 0) + (seat?.price || 0);
                        return (
                          <motion.div
                            key={label}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="group relative"
                          >
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-[#1D5BD8] text-xs font-mono font-bold">
                              {label}
                              <span className="text-[11px] text-[var(--sp-text-muted)] font-normal">
                                +{Number(price || 0).toLocaleString()}
                              </span>
                            </span>
                            <button
                              onClick={() => toggleSeat(label)}
                              aria-label={`Remove seat ${label}`}
                              className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                            >
                              <X size={10} />
                            </button>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Passenger details */}
              <AnimatePresence>
                {selectedSeats.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-slate-100 pt-5 mb-5"
                  >
                    <h4 className="text-xs font-bold text-[#0B1B33] mb-2 uppercase tracking-wider flex items-center gap-1.5">
                      <User size={13} className="text-[#1D5BD8]" />
                      {isRTL ? 'بيانات المسافرين' : 'Passenger Details'}
                    </h4>
                    {selectedSeats.length > 1 && (
                      <p className="text-[11px] text-[var(--sp-text-muted)] mb-3">
                        {isRTL
                          ? 'سيتم استخدام نفس البيانات لجميع المقاعد المختارة'
                          : 'The same details will apply to all selected seats'}
                      </p>
                    )}
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        value={passenger.name}
                        onChange={(e) => setPassenger((p) => ({ ...p, name: e.target.value }))}
                        placeholder={session?.user?.name || (isRTL ? 'اسم المسافر' : 'Passenger name')}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--sp-inset)] border border-[var(--sp-line)] text-[#0B1B33] text-sm placeholder:text-[#9AA8BD] focus:outline-none focus:border-[#1D5BD8] focus:bg-[var(--sp-card)] transition"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="tel"
                          value={passenger.phone}
                          onChange={(e) => setPassenger((p) => ({ ...p, phone: e.target.value }))}
                          placeholder={isRTL ? 'رقم الهاتف (اختياري)' : 'Phone (optional)'}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--sp-inset)] border border-[var(--sp-line)] text-[#0B1B33] text-sm placeholder:text-[#9AA8BD] focus:outline-none focus:border-[#1D5BD8] focus:bg-[var(--sp-card)] transition"
                        />
                        <input
                          type="text"
                          value={passenger.hotel}
                          onChange={(e) => setPassenger((p) => ({ ...p, hotel: e.target.value }))}
                          placeholder={isRTL ? 'الفندق (اختياري)' : 'Hotel (optional)'}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--sp-inset)] border border-[var(--sp-line)] text-[#0B1B33] text-sm placeholder:text-[#9AA8BD] focus:outline-none focus:border-[#1D5BD8] focus:bg-[var(--sp-card)] transition"
                        />
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--sp-text-muted)] pointer-events-none">
                          {t('common.currency')}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={passenger.collectAmount}
                          onChange={(e) => setPassenger((p) => ({ ...p, collectAmount: e.target.value }))}
                          placeholder={t('booking.collectPlaceholder') || (isRTL ? 'مبلغ التحصيل (اختياري)' : 'Collect amount (optional)')}
                          className="w-full pl-12 pr-3.5 py-2.5 rounded-xl bg-[var(--sp-inset)] border border-[var(--sp-line)] text-[#0B1B33] text-sm placeholder:text-[#9AA8BD] focus:outline-none focus:border-[#1D5BD8] focus:bg-[var(--sp-card)] transition"
                        />
                      </div>
                      <textarea
                        value={passenger.notes}
                        onChange={(e) => setPassenger((p) => ({ ...p, notes: e.target.value }))}
                        placeholder={t('booking.notesPlaceholder') || (isRTL ? 'ملاحظات إضافية...' : 'Additional notes...')}
                        rows={2}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--sp-inset)] border border-[var(--sp-line)] text-[#0B1B33] text-sm placeholder:text-[#9AA8BD] focus:outline-none focus:border-[#1D5BD8] focus:bg-[var(--sp-card)] transition resize-none"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Price breakdown */}
              <AnimatePresence>
                {selectedSeats.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-slate-100 pt-4 mb-5 space-y-2 text-sm"
                  >
                    {selectedSeats.map((label) => {
                      const seat = layout?.seats?.find((s) => s.label === label);
                      const price = (segmentPrice || trip?.price || 0) + (seat?.price || 0);
                      return (
                        <div key={label} className="flex justify-between text-xs text-[var(--sp-text-muted)]">
                          <span>
                            <span className="font-mono font-bold text-[#0B1B33]">{label}</span>
                            {seat?.type === 'VIP' && (
                              <span className="ms-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold">VIP</span>
                            )}
                          </span>
                          <span className="font-semibold text-[#0B1B33]">
                            {Number(price || 0).toLocaleString()} {t('common.currency')}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center font-extrabold border-t border-slate-100 pt-3 text-[#0B1B33]">
                      <span>{t('seat.total')}</span>
                      <span className="text-[#1D5BD8] text-xl">
                        {Number(totalPrice || 0).toLocaleString()} <span className="text-xs text-[var(--sp-text-muted)]">{t('common.currency')}</span>
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Book button */}
              {isRoundTrip && !showReturnSeats ? (
                <V2Button
                  size="lg"
                  onClick={scrollToReturn}
                  disabled={selectedSeats.length === 0}
                  className="w-full mt-2"
                >
                  <Repeat size={16} />
                  {isRTL ? 'التالي: اختر مقاعد العودة' : 'Next: Select Return Seats'}
                </V2Button>
              ) : (
                <V2Button
                  size="lg"
                  onClick={handleHold}
                  disabled={selectedSeats.length === 0 || booking || (isRoundTrip && returnSelectedSeats.length === 0)}
                  className="w-full mt-2"
                >
                  {booking ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : selectedSeats.length === 0 ? (
                    t('seat.selectFirst')
                  ) : isRoundTrip ? (
                    <>
                      <Sparkles size={16} />
                      {isRTL ? 'تأكيد الحجز' : 'Confirm Booking'} ({selectedSeats.length + returnSelectedSeats.length})
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      {isRTL ? 'تأكيد الحجز' : 'Confirm Booking'} {selectedSeats.length > 0 ? `(${selectedSeats.length})` : ''}
                    </>
                  )}
                </V2Button>
              )}

              <p className="text-[11px] text-[#9AA8BD] text-center mt-3 flex items-center justify-center gap-1.5">
                <ShieldCheck size={13} className="text-emerald-500" />
                {t('seat.cancel')}
              </p>
            </div>
          </motion.div>
        </div>

        {/* ── RETURN TRIP SECTION (Round Trip) ─────── */}
        {isRoundTrip && showReturnSeats && returnTrip && (
          <motion.div
            ref={returnSectionRef}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-12 pt-8 border-t border-slate-200 scroll-mt-24"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-[#1D5BD8]">
                <Repeat size={20} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-[#0B1B33]">{t('roundtrip.returnTrip')}</h2>
                <p className="text-xs text-[var(--sp-text-muted)]">
                  {returnTrip.origin} {isRTL ? '←' : '→'} {returnTrip.destination} · {formatDate(returnTrip.departure)} {formatTime(returnTrip.departure)}
                </p>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1fr,360px] gap-6 items-start">
              {/* Return seat map */}
              <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-6 sm:p-8 shadow-sm">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-lg font-extrabold text-[#0B1B33]">{t('seat.select')}</h3>
                    <p className="text-xs text-[var(--sp-text-muted)] mt-0.5">{returnTrip.bus?.name} · {returnLayout?.seats?.filter(s => s.type !== 'TOILET')?.length || 0} seats</p>
                  </div>
                </div>

                <div className="flex items-center justify-center mb-6">
                  <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-[var(--sp-inset)] border border-slate-200 text-[var(--sp-text-muted)] text-xs font-bold">
                    <Bus size={15} className="text-[#1D5BD8]" />
                    <span>{isRTL ? 'مقدمة الباص' : 'FRONT OF BUS'}</span>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2 overflow-x-auto pb-4">
                  {Array.from({ length: returnLayout?.rows || 10 }, (_, rowIdx) => {
                    const rowLetter = ROWS[rowIdx];
                    const rowSeatCount = (() => {
                      if (returnLayout?.colsPerRow) {
                        try { return JSON.parse(returnLayout.colsPerRow)[rowLetter] || 4; } catch { return 4; }
                      }
                      return returnLayout?.cols || 4;
                    })();
                    const aislePos = returnLayout?.aisleAfter ?? 2;
                    return (
                      <div key={rowIdx} className="flex gap-2 items-center">
                        <div className="w-8 flex items-center justify-center text-xs text-slate-400 font-extrabold">{rowLetter}</div>
                        {Array.from({ length: rowSeatCount }, (_, colIdx) => {
                          const col = colIdx + 1;
                          const seat = getSeatAt(rowIdx, col, returnLayout?.seats);
                          const isAisle = col === aislePos + 1 && rowSeatCount > 3;
                          const isSelected = returnSelectedSeats.includes(seat?.label || '');
                          const isReserved = seat && returnReservedSeats.has(seat.label);
                          return (
                            <div key={colIdx} className={cn('flex gap-2', isAisle ? 'ml-8' : '')}>
                              {seat ? (
                                <SeatButton
                                  seat={seat}
                                  isSelected={isSelected}
                                  isReserved={isReserved}
                                  onToggle={toggleReturnSeat}
                                  tripPrice={returnTrip?.price || 0}
                                  t={t}
                                />
                              ) : (
                                <div className="w-11 h-11" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Return trip summary sidebar */}
              <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-6 shadow-sm sticky top-24">
                <h3 className="font-extrabold text-base text-[#0B1B33] mb-1">{t('roundtrip.returnTrip')}</h3>
                <p className="text-xs text-[var(--sp-text-muted)] mb-4">{returnTrip.bus?.name}</p>

                <div className="space-y-2 mb-5 text-xs text-[var(--sp-text-muted)]">
                  <div className="flex items-center gap-2">
                    <MapPin size={13} className="text-[#1D5BD8]" />
                    <span className="font-bold text-[#0B1B33]">{returnTrip.origin}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={13} className="text-[#1D5BD8]" />
                    {formatDate(returnTrip.departure)} {formatTime(returnTrip.departure)}
                  </div>
                </div>

                {/* Return selected seats */}
                <div className="mb-4">
                  <h4 className="text-xs font-bold text-[var(--sp-text-muted)] mb-2">{t('seat.selectedSeats')}</h4>
                  {returnSelectedSeats.length === 0 ? (
                    <p className="text-xs text-[#9AA8BD]">{t('seat.clickSeat')}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {returnSelectedSeats.map((label) => (
                        <span key={label} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#1D5BD8] text-xs font-mono font-bold">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Combined price */}
                {returnSelectedSeats.length > 0 && (
                  <div className="border-t border-slate-100 pt-4 space-y-1.5 text-xs">
                    <div className="flex justify-between text-[var(--sp-text-muted)]">
                      <span>{t('roundtrip.outboundTrip')}</span>
                      <span className="font-semibold text-[#0B1B33]">{Number(totalPrice || 0).toLocaleString()} {t('common.currency')}</span>
                    </div>
                    <div className="flex justify-between text-[var(--sp-text-muted)]">
                      <span>{t('roundtrip.returnTrip')}</span>
                      <span className="font-semibold text-[#0B1B33]">{Number(returnTotalPrice || 0).toLocaleString()} {t('common.currency')}</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-[#0B1B33] border-t border-slate-100 pt-2 text-sm">
                      <span>{t('roundtrip.totalBoth')}</span>
                      <span className="text-[#1D5BD8] text-lg font-extrabold">{Number((totalPrice || 0) + (returnTotalPrice || 0)).toLocaleString()} {t('common.currency')}</span>
                    </div>
                  </div>
                )}

                <V2Button
                  size="lg"
                  onClick={handleHold}
                  disabled={returnSelectedSeats.length === 0 || booking}
                  className="w-full mt-4"
                >
                  {booking ? (
                    <><Loader2 size={18} className="animate-spin" /> {t('common.loading')}</>
                  ) : (
                    <><Sparkles size={16} /> {isRTL ? 'تأكيد الحجز' : 'Confirm Booking'} ({selectedSeats.length + returnSelectedSeats.length})</>
                  )}
                </V2Button>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* ── FOOTER ───────────────────────────────────── */}
      <V2SiteFooter />
    </div>
  );
}

// Seat button with micro-interactions
function SeatButton({ seat, isSelected, isReserved, onToggle, tripPrice, t }: any) {
  const isToilet = seat?.type === 'TOILET';
  const isVip = seat?.type === 'VIP';
  const unitPrice = Number((tripPrice || 0) + (seat?.price || 0));

  return (
    <motion.button
      type="button"
      whileHover={!isReserved && !isSelected && !isToilet ? { scale: 1.15, y: -2 } : {}}
      whileTap={!isReserved && !isToilet ? { scale: 0.9 } : {}}
      onClick={() => !isReserved && !isToilet && onToggle(seat.label)}
      disabled={isReserved || isToilet}
      aria-label={`Seat ${seat.label}`}
      aria-pressed={isSelected}
      title={
        isToilet
          ? '🚻 دورة مياه'
          : `${seat.label}${isVip ? ' (VIP)' : ''} — ${unitPrice.toLocaleString()} ${t('common.currency')}`
      }
      className={cn(
        'relative size-11 rounded-xl flex flex-col items-center justify-center text-xs font-extrabold transition-all duration-200 select-none',
        isToilet
          ? 'bg-purple-50 border border-purple-200 text-purple-700 cursor-not-allowed opacity-90'
          : isReserved
          ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
          : isSelected
          ? 'bg-[#1D5BD8] border-2 border-[#1D5BD8] text-white shadow-[0_8px_20px_rgba(29,91,216,0.35)] scale-105 z-20 animate-seat-bounce-glow cursor-pointer'
          : isVip
          ? 'bg-amber-50 border-2 border-amber-300 text-amber-800 hover:bg-amber-100 hover:border-amber-400 cursor-pointer shadow-sm'
          : 'bg-[var(--sp-seat-bg)] border-2 border-[var(--sp-seat-line)] text-[var(--sp-text-muted)] hover:border-[#1D5BD8]/60 hover:text-[#1D5BD8] hover:bg-blue-50/40 cursor-pointer shadow-sm'
      )}
    >
      <span className="font-mono leading-none">{isToilet ? '🚻' : seat.label}</span>
      {isVip && !isToilet && !isSelected && (
        <span className="text-[9px] font-bold text-amber-600 leading-none mt-0.5">VIP</span>
      )}
    </motion.button>
  );
}

// Confirmation modal card in modern V2 design
function ConfirmationCard({ t, isRTL, confirmedBookings, trip, formatDate, formatTime, onClose, onBookAnother, onViewBookings, sessionRole }: any) {
  const isMulti = confirmedBookings.length > 1;
  const first = confirmedBookings[0];
  const busName = first?.trip?.bus?.name || trip?.bus?.name || '-';
  const totalAmount = confirmedBookings.reduce((sum: number, b: any) => sum + (b?.total ?? 0), 0);

  return (
    <div
      className={cn(
        'rounded-3xl border border-[var(--sp-line)] bg-[var(--sp-card)] shadow-2xl overflow-hidden',
        isRTL ? 'text-right' : 'text-left'
      )}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <div className="relative p-6 sm:p-8 pb-5 border-b border-slate-100 bg-[var(--sp-inset)]/60">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-[#0B1B33] hover:bg-slate-200/60 transition"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
          className="size-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/30"
        >
          <Check size={32} className="stroke-[3]" />
        </motion.div>
        <h2 className="text-2xl font-extrabold text-[#0B1B33]">
          {t('confirmed.title')}
        </h2>
        <p className="mt-1 text-sm text-[var(--sp-text-muted)]">
          {t('confirmed.desc')}
        </p>
      </div>

      {/* Details */}
      <div className="p-6 sm:p-8 space-y-4 text-sm">
        {/* Bus & Route */}
        <div className="rounded-2xl bg-[var(--sp-inset)] p-4 space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-[var(--sp-text-muted)]">{isRTL ? 'المسار' : 'Route'}</span>
            <div className="flex items-center gap-1.5 font-bold text-[#0B1B33]">
              <MapPin size={14} className="text-[#1D5BD8]" />
              <span>{trip.origin}</span>
              <span className="text-slate-400 mx-1">{isRTL ? '←' : '→'}</span>
              <span>{trip.destination}</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-xs text-[var(--sp-text-muted)]">
            <span>{isRTL ? 'موعد الرحلة' : 'Departure'}</span>
            <span className="font-semibold text-[#0B1B33]">
              {formatDate(trip.departure)} · {formatTime(trip.departure)}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs text-[var(--sp-text-muted)]">
            <span>{isRTL ? 'رقم الباص' : 'Bus'}</span>
            <span className="font-semibold text-[#0B1B33] flex items-center gap-1">
              <Bus size={13} className="text-[#1D5BD8]" />
              {busName}
            </span>
          </div>
        </div>

        {/* Bookings / Seats Breakdown */}
        {isMulti ? (
          <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
            {confirmedBookings.map((b: any) => (
              <div key={b.id || b.reference} className="flex justify-between items-center bg-[var(--sp-inset)] rounded-xl p-3 border border-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[#1D5BD8] text-xs font-bold bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                    {b.reference}
                  </span>
                  <span className="text-xs font-bold text-[#0B1B33]">
                    {isRTL ? 'مقعد' : 'Seat'} <strong className="font-mono text-[#1D5BD8]">{b.seatLabel}</strong>
                  </span>
                </div>
                <span className="font-extrabold text-[#0B1B33]">
                  {Math.round(b.total ?? 0).toLocaleString()} {t('common.currency')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-inset)] p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-[var(--sp-text-muted)]">{isRTL ? 'كود الحجز' : 'Booking Code'}</span>
              <span className="font-mono text-[#1D5BD8] text-base font-bold bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl">
                {first?.reference}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-[var(--sp-text-muted)]">{isRTL ? 'رقم المقعد' : 'Seat'}</span>
              <span className="inline-flex px-3 py-1 rounded-xl bg-[#0A1E3C] text-white font-mono font-bold text-sm">
                {first?.seatLabel}
              </span>
            </div>
          </div>
        )}

        {/* Total */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-100">
          <span className="font-bold text-[#0B1B33] text-base">{t('confirmed.totalPaid')}</span>
          <span className="text-2xl font-extrabold text-emerald-600">
            {Math.round(totalAmount ?? 0).toLocaleString()} {t('common.currency')}
          </span>
        </div>

        {/* Payment notice */}
        <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-3 text-xs font-medium text-amber-800 flex items-center gap-2">
          <Clock size={14} className="text-amber-600 shrink-0" />
          <span>{isRTL ? 'سيتم تأكيد الحجز بعد استلام الأدمن للدفع' : 'Booking will be confirmed after admin receives payment'}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="p-6 sm:p-8 pt-0 flex flex-col sm:flex-row gap-3">
        <button
          onClick={onViewBookings}
          className="flex-1 py-3.5 rounded-xl bg-[#0A1E3C] hover:bg-[#142d54] text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-md"
        >
          <Ticket size={16} />
          {isRTL ? 'عرض حجوزاتي' : 'View My Bookings'}
        </button>
        <button
          onClick={onBookAnother}
          className="flex-1 py-3.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-[#0B1B33] font-bold text-sm transition flex items-center justify-center gap-2"
        >
          <Sparkles size={16} className="text-amber-500" />
          {t('confirmed.bookAnother')}
        </button>
        {confirmedBookings.length > 0 && (() => {
          const isCompany = sessionRole === 'COMPANY_ADMIN';
          const firstId = isCompany ? first?.id : first?.id;
          if (!firstId) return null;
          const printUrl = isCompany ? `/company/bookings/${firstId}/print` : `/bookings/${firstId}/print`;
          return (
            <a
              href={printUrl}
              className="flex-1 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-md"
            >
              <Printer size={16} />
              {isRTL ? 'طباعة التذكرة' : 'Print Ticket'}
            </a>
          );
        })()}
      </div>
    </div>
  );
}

export default function TripDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="v2 min-h-dvh bg-[var(--sp-bg)]">
          <V2SiteHeader />
          <div className="v2-container py-16 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-[#1D5BD8]" />
          </div>
        </div>
      }
    >
      <TripDetailPageContent />
    </Suspense>
  );
}
