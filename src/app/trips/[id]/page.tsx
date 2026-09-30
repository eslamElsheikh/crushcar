'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Clock, MapPin, Loader2, Check, Bus, Sparkles, X, User, Repeat, Map, Navigation, Ticket, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatTime } from '@/lib/utils'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface Seat {
  id: string
  label: string
  row: number
  col: number
  type: string
  price: number
}

interface TripStop {
  id?: string
  tripId?: string
  stationId: string
  station?: { id: string; name: string; city: string }
  stopOrder: number
  priceFromOrigin: number
  arrivalTime?: string
  departureTime?: string
}

interface Trip {
  id: string
  origin: string
  destination: string
  departure: string
  arrival: string
  price: number
  status: string
  tripStops: TripStop[]
  bus: {
    id: string
    name: string
    type: string
    stations?: { id: string; name: string; order: number }[]
    layout?: {
      rows: number
      cols: number
      aisleAfter: number
      colsPerRow: string
      seats: Seat[]
    }
  }
  bookings: { seatLabel: string; fromStopOrder?: number; toStopOrder?: number }[]
  companyBookings?: { seatLabel: string; fromStopOrder?: number; toStopOrder?: number }[]
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
const AISLE_AFTER = 2

export default function TripDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tripId = params.id as string
  const returnTripId = searchParams.get('returnTripId')
  const returnDateParam = searchParams.get('returnDate')
  const urlFromStationId = searchParams.get('fromStationId')
  const urlToStationId = searchParams.get('toStationId')
  const { data: session } = useSession()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [trip, setTrip] = useState<Trip | null>(null)
  const [returnTrip, setReturnTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSeats, setSelectedSeats] = useState<string[]>([])
  const [returnSelectedSeats, setReturnSelectedSeats] = useState<string[]>([])
  const [passengerNames, setPassengerNames] = useState<Record<string, string>>({})
  const [passengerPhones, setPassengerPhones] = useState<Record<string, string>>({})
  const [passengerHotels, setPassengerHotels] = useState<Record<string, string>>({})
  const [returnPassengerNames, setReturnPassengerNames] = useState<Record<string, string>>({})
  const [returnPassengerPhones, setReturnPassengerPhones] = useState<Record<string, string>>({})
  const [returnPassengerHotels, setReturnPassengerHotels] = useState<Record<string, string>>({})
  const [booking, setBooking] = useState(false)
  const [showReturnSeats, setShowReturnSeats] = useState(false)
  const [confirmedBookings, setConfirmedBookings] = useState<any[]>([])
  const [lastToast, setLastToast] = useState<string>('')

  // Stop selection
  const [fromStationId, setFromStationId] = useState<string | null>(urlFromStationId)
  const [toStationId, setToStationId] = useState<string | null>(urlToStationId)
  const [showStopSelector, setShowStopSelector] = useState(false)

  async function loadTrip() {
    try {
      const res = await fetch(`/api/trips/${tripId}`)
      const data = await res.json()
      setTrip(data)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  async function loadReturnTrip() {
    if (!returnTripId) return
    try {
      const res = await fetch(`/api/trips/${returnTripId}`)
      const data = await res.json()
      setReturnTrip(data)
    } catch {}
  }

  useEffect(() => {
    loadTrip()
    if (returnTripId) loadReturnTrip()
  }, [tripId, returnTripId])

  // Auto-select first/last stops when trip loads and no intermediate stops
  useEffect(() => {
    if (!trip) return
    const stops = trip.tripStops || []
    if (stops.length === 0) {
      // No stops at all - this is a direct trip, no selector needed
      setShowStopSelector(false)
    } else if (stops.length <= 2) {
      // No intermediate stops - auto-select origin and destination
      const first = stops[0]?.stationId || null
      const last = stops[stops.length - 1]?.stationId || null
      if (!fromStationId) setFromStationId(first)
      if (!toStationId) setToStationId(last)
      setShowStopSelector(false)
    } else if (!urlFromStationId || !urlToStationId) {
      // Has intermediate stops - show selector only if not coming from URL
      setShowStopSelector(true)
    }
  }, [trip])

  // Realtime polling + notifications
  useEffect(() => {
    const interval = setInterval(loadTrip, 5000)
    if (returnTripId) {
      const returnInterval = setInterval(loadReturnTrip, 5000)
      return () => { clearInterval(interval); clearInterval(returnInterval) }
    }
    return () => clearInterval(interval)
  }, [tripId, returnTripId])

  useEffect(() => {
    if (!trip) return
    const allReserved = new Set([
      ...(trip.bookings || []).map((b: any) => b.seatLabel),
      ...(trip.companyBookings || []).map((b: any) => b.seatLabel),
    ])
    const nowReserved = selectedSeats.filter((s) => allReserved.has(s))
    if (nowReserved.length > 0) {
      const msg = `${t('seat.reserved')} ${nowReserved[0]}`
      if (msg !== lastToast) {
        setSelectedSeats((prev) => prev.filter((s) => !allReserved.has(s)))
        toast.error(msg)
        setLastToast(msg)
      }
    }
  }, [trip, t])

  useEffect(() => {
    if (!returnTrip) return
    const allReserved = new Set([
      ...(returnTrip.bookings || []).map((b: any) => b.seatLabel),
      ...(returnTrip.companyBookings || []).map((b: any) => b.seatLabel),
    ])
    const nowReserved = returnSelectedSeats.filter((s) => allReserved.has(s))
    if (nowReserved.length > 0) {
      const msg = `${t('seat.reserved')} ${nowReserved[0]}`
      if (msg !== lastToast) {
        setReturnSelectedSeats((prev) => prev.filter((s) => !allReserved.has(s)))
        toast.error(msg)
        setLastToast(msg)
      }
    }
  }, [returnTrip, t])

  // Determine which seats are unavailable for the selected segment
  function getUnavailableSeatsForSegment(t: Trip | null, fromSid: string | null, toSid: string | null): Set<string> {
    if (!t) return new Set()
    const stops = t.tripStops || []
    const allBookings = t.bookings || []
    const allCompanyBookings = t.companyBookings || []

    const addBookingsToSet = (bookings: { seatLabel: string; fromStopOrder?: number; toStopOrder?: number }[]) => {
      // Direct trip with no stops - all booked seats are unavailable
      if (stops.length === 0) {
        return new Set(bookings.map(b => b.seatLabel))
      }

      const fStop = stops.find(s => s.stationId === fromSid)
      const tStop = stops.find(s => s.stationId === toSid)
      const fOrder = fStop?.stopOrder ?? 1
      const tOrder = tStop?.stopOrder ?? stops.length
      if (fOrder >= tOrder) return new Set(bookings.map(b => b.seatLabel))

      const taken = new Set<string>()

      // Check bookings with overlapping segments
      for (const b of bookings) {
        const bFrom = b.fromStopOrder ?? fOrder
        const bTo = b.toStopOrder ?? tOrder
        if (bFrom < tOrder && bTo > fOrder) {
          taken.add(b.seatLabel)
        }
      }

      return taken
    }

    const takenFromBookings = addBookingsToSet(allBookings)
    const takenFromCompany = addBookingsToSet(allCompanyBookings)

    return new Set([...takenFromBookings, ...takenFromCompany])
  }

  const reservedSeats = getUnavailableSeatsForSegment(trip, fromStationId, toStationId)
  const returnFromStationId = searchParams.get('returnFromStationId') || null
  const returnToStationId = searchParams.get('returnToStationId') || null
  const returnReservedSeats = getUnavailableSeatsForSegment(returnTrip, returnFromStationId, returnToStationId)
  const layout = trip?.bus?.layout
  const returnLayout = returnTrip?.bus?.layout

  function toggleSeat(label: string) {
    if (reservedSeats.has(label)) return
    setSelectedSeats((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    )
  }

  function toggleReturnSeat(label: string) {
    if (returnReservedSeats.has(label)) return
    setReturnSelectedSeats((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    )
  }

  async function handleHold() {
    if (selectedSeats.length === 0) return
    if (!session) {
      toast.error(isRTL ? 'سجل دخول أولاً' : 'Please sign in first')
      router.push('/login')
      return
    }
    await proceedToPayment()
  }

  async function proceedToPayment() {
    if (!session) {
      toast.error(isRTL ? 'سجل دخول أولاً' : 'Please sign in first')
      router.push('/login')
      return
    }
    setBooking(true)

    const tripStopsList = trip?.tripStops || []
    const outboundFromId = fromStationId || tripStopsList[0]?.stationId || null
    const outboundToId = toStationId || tripStopsList[tripStopsList.length - 1]?.stationId || null

    // If no tripStops exist, this is a direct trip - allow booking without station IDs
    const isDirectTrip = tripStopsList.length === 0

    if (!isDirectTrip && (!outboundFromId || !outboundToId)) {
      toast.error(isRTL ? 'اختر محطات الصعود والنزول' : 'Select boarding and alighting stations')
      setBooking(false)
      return
    }

    const seats: { seatLabel: string; passengerName: string; passengerPhone: string; fromStationId: string | null; toStationId: string | null }[] = selectedSeats.map((seatLabel) => ({
      seatLabel,
      passengerName: passengerNames[seatLabel] || session.user?.name || '',
      passengerPhone: passengerPhones[seatLabel] || '',
      fromStationId: isDirectTrip ? null : outboundFromId,
      toStationId: isDirectTrip ? null : outboundToId,
    }))

    const returnTripStops = returnTrip?.tripStops || []
    const returnFromId = searchParams.get('returnFromStationId') || returnTripStops[0]?.stationId || undefined
    const returnToId = searchParams.get('returnToStationId') || returnTripStops[returnTripStops.length - 1]?.stationId || undefined
    const returnSeats = returnTripId && returnFromId && returnToId ? returnSelectedSeats.map((seatLabel) => ({
      seatLabel,
      passengerName: returnPassengerNames[seatLabel] || session.user?.name || '',
      passengerPhone: returnPassengerPhones[seatLabel] || '',
      fromStationId: returnFromId,
      toStationId: returnToId,
    })) : undefined

    try {
      const allSeats = [...seats, ...(returnSeats || [])]
      const confirmed: any[] = []

      // COMPANY_ADMIN: use company booking endpoint (batch per trip)
      if (session.user.role === 'COMPANY_ADMIN') {
        // Group seats by tripId
        const outboundPassengers = seats.map(s => ({ seatLabel: s.seatLabel, passengerName: s.passengerName, passengerPhone: s.passengerPhone, passengerHotel: passengerHotels[s.seatLabel] || '', fromStationId: s.fromStationId, toStationId: s.toStationId }))
        const returnPassengers = returnSeats ? returnSeats.map(s => ({ seatLabel: s.seatLabel, passengerName: s.passengerName, passengerPhone: s.passengerPhone, passengerHotel: returnPassengerHotels[s.seatLabel] || '', fromStationId: s.fromStationId, toStationId: s.toStationId })) : undefined

        const groups: { tripId: string; passengers: typeof outboundPassengers }[] = []
        if (outboundPassengers.length > 0 && tripId) groups.push({ tripId, passengers: outboundPassengers })
        if (returnPassengers && returnPassengers.length > 0 && returnTripId) groups.push({ tripId: returnTripId, passengers: returnPassengers })

        const hasRoundTrip = groups.length > 1
        const roundTripGroupId = hasRoundTrip ? crypto.randomUUID() : undefined

        let allOk = true
        for (const group of groups) {
          const isGroupReturn = group.tripId === returnTripId
          const groupFromId = isGroupReturn ? returnFromId : outboundFromId
          const groupToId = isGroupReturn ? returnToId : outboundToId
          const res = await fetch('/api/company/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tripId: group.tripId,
              passengers: group.passengers.map(p => ({ seatLabel: p.seatLabel, passengerName: p.passengerName, passengerPhone: p.passengerPhone, passengerHotel: (p as any).passengerHotel })),
              bookingType: 'FOR_CLIENT',
              fromStationId: groupFromId || null,
              toStationId: groupToId || null,
              roundTripGroupId,
            }),
            credentials: 'include',
          })
          const data = await res.json()
          if (res.ok && data.bookings) {
            confirmed.push(...data.bookings)
          } else {
            allOk = false
            toast.error(data.error || t('common.error'))
          }
        }

        if (allOk && confirmed.length > 0) {
          setConfirmedBookings(confirmed)
          setSelectedSeats([])
          setReturnSelectedSeats([])
          setPassengerNames({})
          setPassengerPhones({})
          setPassengerHotels({})
          setReturnPassengerNames({})
          setReturnPassengerPhones({})
          setReturnPassengerHotels({})
          toast.success(isRTL ? 'تم الحجز بنجاح، تأكد من الدفع في صفحة الحجوزات' : 'Booked successfully, confirm payment in bookings page')
        }
      } else {
        // CUSTOMER: use regular booking endpoint (one per seat)
        let successCount = 0
        let errorCount = 0

        for (let i = 0; i < allSeats.length; i++) {
          const seat = allSeats[i]
          const isReturn = i >= seats.length
          const targetTripId = isReturn ? returnTripId : tripId
          if (!targetTripId) continue

          const res = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tripId: targetTripId,
              seatLabel: seat.seatLabel,
              passengerName: seat.passengerName,
              passengerPhone: seat.passengerPhone,
              fromStationId: seat.fromStationId,
              toStationId: seat.toStationId,
            }),
            credentials: 'include',
          })
          const data = await res.json()
          if (res.ok) {
            successCount++
            confirmed.push(data)
          } else {
            errorCount++
            if (data.error === 'SEAT_TAKEN') {
              toast.error(isRTL ? `المقعد ${seat.seatLabel} محجوز` : `Seat ${seat.seatLabel} is taken`)
            } else {
              toast.error(data.error || t('common.error'))
            }
          }
        }

        if (successCount > 0) {
          setConfirmedBookings(confirmed)
          setSelectedSeats([])
          setReturnSelectedSeats([])
          setPassengerNames({})
          setPassengerPhones({})
          setReturnPassengerNames({})
          setReturnPassengerPhones({})
        }
      }
    } catch {
      toast.error(t('common.error'))
    }
    setBooking(false)
  }

  function getSeatAt(rowIdx: number, col: number, seatsList?: Seat[]): Seat | undefined {
    return (seatsList || layout?.seats)?.find((s) => s.row === rowIdx && s.col === col)
  }

  const isRoundTrip = !!(returnTripId && returnTrip)
  const tripStops: TripStop[] = trip?.tripStops || []
  const fromStop = tripStops.find(s => s.stationId === fromStationId) || tripStops[0]
  const toStop = tripStops.find(s => s.stationId === toStationId) || tripStops[tripStops.length - 1]
  const segmentPrice = (fromStop && toStop && toStop.stopOrder > fromStop.stopOrder)
    ? toStop.priceFromOrigin - fromStop.priceFromOrigin
    : (trip?.price || 0)

  const totalPrice = selectedSeats.reduce((sum, label) => {
    const seat = layout?.seats.find((s) => s.label === label)
    return sum + (segmentPrice || trip?.price || 0) + (seat?.price || 0)
  }, 0)

  const returnTotalPrice = returnSelectedSeats.reduce((sum, label) => {
    const seat = returnLayout?.seats.find((s) => s.label === label)
    return sum + (returnTrip?.price || 0) + (seat?.price || 0)
  }, 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-400">{t('trips.noTrips')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#030303] text-foreground overflow-x-hidden relative">
      {/* Confirmation Modal Overlay */}
      <AnimatePresence>
        {confirmedBookings.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setConfirmedBookings([])} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
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
                onBookAnother={() => { setConfirmedBookings([]) }}
                onViewBookings={() => router.push(session?.user?.role === 'COMPANY_ADMIN' ? '/company/bookings' : '/bookings')}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      </div>

      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn(
          'sticky top-0 z-50 backdrop-blur-2xl bg-black/60 border-b border-white/5',
          'transition-all duration-300'
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link
            href="/trips"
            className="p-2.5 rounded-xl glass hover:bg-white/5 border border-white/5 transition-all duration-200 hover:scale-105 active:scale-95 group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
          </Link>
          <div className="flex-1 min-w-0">
            <motion.h1
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-semibold text-white truncate flex items-center gap-2"
            >
              <MapPin size={14} className="text-blue-400 flex-shrink-0" />
              <span>{trip.origin}</span>
              <span className="text-zinc-600 mx-1">{isRTL ? '←' : '→'}</span>
              <span>{trip.destination}</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5"
            >
              <Clock size={11} />
              {formatDate(trip.departure)} {t('trips.departure')} {formatTime(trip.departure)}
              <span className="mx-2">•</span>
              <Bus size={11} />
              {trip.bus?.name}
            </motion.p>
          </div>

          {/* Right nav */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {session && (session.user.role === 'COMPANY_ADMIN' || session.user.role === 'SUPER_ADMIN') ? (
              <>
                <Link href="/admin" className="text-sm text-zinc-400 hover:text-white transition font-medium px-3 py-1.5 rounded-lg hover:bg-white/5">
                  {t('nav.admin')}
                </Link>
                <Link href="/profile" className="text-sm text-zinc-400 hover:text-white transition font-medium px-3 py-1.5 rounded-lg hover:bg-white/5">
                  {isRTL ? 'حسابي' : 'Account'}
                </Link>
              </>
            ) : (
              <>
                <Link href="/bookings" className="text-sm text-zinc-400 hover:text-white transition font-medium px-3 py-1.5 rounded-lg hover:bg-white/5">
                  {isRTL ? 'حجوزاتي' : 'My Bookings'}
                </Link>
                <Link href="/profile" className="text-sm text-zinc-400 hover:text-white transition font-medium px-3 py-1.5 rounded-lg hover:bg-white/5">
                  {isRTL ? 'حسابي' : 'Account'}
                </Link>
              </>
            )}
          </div>
        </div>
      </motion.header>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* ── STOP SELECTOR ─────────────────────────── */}
        {showStopSelector && tripStops.length > 2 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-3xl p-5 sm:p-6 border border-white/5 mb-6 shadow-2xl"
          >
            <h3 className={cn('text-sm font-semibold mb-4 text-white flex items-center gap-2', isRTL && 'font-[Cairo]')}>
              <Navigation size={14} className="text-blue-400" />
              {isRTL ? 'اختر محطتي الصعود والنزول' : 'Select Boarding & Alighting Stations'}
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">{isRTL ? 'محطة الصعود' : 'Boarding Station'}</label>
                <select
                  value={fromStationId || ''}
                  onChange={(e) => setFromStationId(e.target.value || null)}
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-800/60 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                >
                  <option value="">{isRTL ? 'اختر' : 'Select...'}</option>
                  {tripStops.filter(s => s.stationId !== toStationId).map((s) => (
                    <option key={s.stationId} value={s.stationId}>
                      {s.station?.name || s.stationId}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">{isRTL ? 'محطة النزول' : 'Alighting Station'}</label>
                <select
                  value={toStationId || ''}
                  onChange={(e) => setToStationId(e.target.value || null)}
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-800/60 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                >
                  <option value="">{isRTL ? 'اختر' : 'Select...'}</option>
                  {tripStops.filter(s => s.stationId !== fromStationId).map((s) => (
                    <option key={s.stationId} value={s.stationId}>
                      {s.station?.name || s.stationId}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {fromStationId && toStationId && fromStop && toStop && (
              <div className="mt-4 text-xs text-zinc-400 flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2.5">
                <MapPin size={12} className="text-blue-400" />
                <span className="text-white font-medium">{fromStop.station?.name || fromStationId}</span>
                <span className="text-zinc-600">{isRTL ? '←' : '→'}</span>
                <span className="text-white font-medium">{toStop.station?.name || toStationId}</span>
                <span className="text-zinc-600 mx-2">•</span>
                <span className="text-emerald-400 font-semibold">{segmentPrice.toLocaleString()} {t('common.currency')}</span>
                <button
                  onClick={() => { setShowStopSelector(false) }}
                  className="ml-auto text-blue-400 hover:text-blue-300 text-xs font-medium"
                >
                  {isRTL ? 'تأكيد' : 'Confirm'}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Show current segment info when stops are selected OR direct trip */}
        {!showStopSelector && tripStops.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-6 text-sm text-zinc-400 bg-white/[0.02] border border-white/5 rounded-2xl px-5 py-3"
          >
            <MapPin size={14} className="text-blue-400" />
            <span className="text-white font-medium">{trip.origin}</span>
            <span className="text-zinc-600">{isRTL ? '←' : '→'}</span>
            <span className="text-white font-medium">{trip.destination}</span>
            <span className="text-zinc-600 mx-2">•</span>
            <span className="text-emerald-400 font-semibold">{trip.price.toLocaleString()} {t('common.currency')}</span>
          </motion.div>
        )}

        {/* Show current segment info when stops are selected */}
        {!showStopSelector && tripStops.length > 0 && fromStationId && toStationId && fromStop && toStop && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-6 text-sm text-zinc-400 bg-white/[0.02] border border-white/5 rounded-2xl px-5 py-3"
          >
            <MapPin size={14} className="text-blue-400" />
            <span className="text-white font-medium">{fromStop.station?.name || fromStationId}</span>
            <span className="text-zinc-600">{isRTL ? '←' : '→'}</span>
            <span className="text-white font-medium">{toStop.station?.name || toStationId}</span>
            <span className="text-zinc-600 mx-2">•</span>
            <span className="text-emerald-400 font-semibold">{segmentPrice.toLocaleString()} {t('common.currency')}</span>
            {tripStops.length > 2 && (
              <button
                onClick={() => setShowStopSelector(true)}
                className="ml-auto text-xs text-zinc-500 hover:text-white transition flex items-center gap-1"
              >
                <Navigation size={12} />
                {isRTL ? 'تغيير' : 'Change'}
              </button>
            )}
          </motion.div>
        )}

        <div className="grid lg:grid-cols-[1fr,340px] gap-8">
          {/* ── SEAT MAP ─────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="glass rounded-3xl p-6 sm:p-10 border border-white/5 shadow-2xl shadow-blue-500/5">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className={cn(
                    'text-xl font-display font-bold text-white',
                    isRTL && 'font-[Cairo]'
                  )}>
                    {t('seat.select')}
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {trip.bus?.name} • {layout?.seats?.length || 0} {t('layout.totalSeats')}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  {[
                    { label: t('seat.available'), class: 'seat-available border text-blue-400 px-3 py-1.5 rounded-lg' },
                    { label: t('seat.selected'), class: 'seat-selected px-3 py-1.5 rounded-lg' },
                    { label: t('seat.reserved'), class: 'seat-reserved border px-3 py-1.5 rounded-lg' },
                    { label: t('seat.vipSeat'), class: 'seat-vip border px-3 py-1.5 rounded-lg' },
                  ].map((item) => (
                    <span key={item.label} className={item.class}>{item.label}</span>
                  ))}
                </div>
              </div>

              {/* Bus front */}
              <div className="flex items-center justify-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.3 }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full glass border border-white/5"
                >
                  <span className="text-base">🚍</span>
                  <span className="text-xs font-medium text-zinc-500">{isRTL ? 'الأمام' : 'FRONT OF BUS'}</span>
                </motion.div>
              </div>

              {/* Column numbers - matching seat layout exactly */}
              <div className="flex flex-col items-center gap-1.5 mb-3">
                <div className="flex gap-2 items-center">
                  <div className="w-8" />
                  {(() => {
                    const aislePos = layout?.aisleAfter ?? 2
                    const rowSeatCount = (() => {
                      if (layout?.colsPerRow) {
                        try {
                          const parsed = JSON.parse(layout.colsPerRow)
                          return parsed[ROWS[0]] || 4
                        } catch { return 4 }
                      }
                      return layout?.cols || 4
                    })()
                    return Array.from({ length: rowSeatCount }, (_, colIdx) => {
                      const col = colIdx + 1
                      const isAisle = col === aislePos + 1 && rowSeatCount > 3
                      return (
                        <div key={colIdx} className={cn('flex gap-2', isAisle ? 'ml-8' : '')}>
                          <div className="w-11 text-center text-xs text-zinc-600 font-medium">{col}</div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* Seat grid */}
              <div className="flex flex-col items-center gap-1.5">
                {Array.from({ length: layout?.rows || 10 }, (_, rowIdx) => {
                  const rowLetter = ROWS[rowIdx]
                  const rowSeatCount = (() => {
                    if (layout?.colsPerRow) {
                      try {
                        const parsed = JSON.parse(layout.colsPerRow)
                        return parsed[rowLetter] || 4
                      } catch { return 4 }
                    }
                    return layout?.cols || 4
                  })()
                  const aislePos = layout?.aisleAfter ?? 2
                  return (
                  <motion.div
                    key={rowIdx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + rowIdx * 0.03 }}
                    className="flex gap-2"
                  >
                    {/* Row label */}
                    <div className="w-8 flex items-center justify-center text-xs text-zinc-600 font-bold">{rowLetter}</div>

                    {Array.from({ length: rowSeatCount }, (_, colIdx) => {
                      const col = colIdx + 1
                      const seat = getSeatAt(rowIdx, col)
                      const isAisle = col === aislePos + 1 && rowSeatCount > 3
                      const isSelected = selectedSeats.includes(seat?.label || '')
                      const isReserved = seat && reservedSeats.has(seat.label)

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
                      )
                    })}
                  </motion.div>
                )})}
              </div>

              {/* Aisle label */}
              <div className="flex justify-center mt-6">
                <div className="text-[10px] text-zinc-700 uppercase tracking-widest px-3 py-1 rounded">
                  {isRTL ? 'الممر' : 'AISLE'}
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── BOOKING SIDEBAR ──────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="glass rounded-3xl p-6 border border-white/5 shadow-2xl sticky top-28 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-hide">
              {isRoundTrip && (
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                  <Repeat size={14} className="text-blue-400" />
                  <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full">
                    {t('roundtrip.bothLegs')}
                  </span>
                </div>
              )}

              <h3 className={cn(
                'font-display font-bold text-lg mb-1 text-white',
                isRTL && 'font-[Cairo]'
              )}>
                {isRoundTrip ? t('roundtrip.outboundTrip') : t('seat.summary')}
              </h3>
              <p className="text-xs text-zinc-500 mb-6">{t('search.desc')}</p>

              {/* Route visualization */}
              <div className="space-y-3 mb-4 text-sm">
                {tripStops.map((stop, idx) => {
                  const isFrom = stop.stationId === fromStationId
                  const isTo = stop.stationId === toStationId
                  const isSelected = isFrom || isTo
                  const isFirst = idx === 0
                  const isLast = idx === tripStops.length - 1
                  return (
                    <motion.div
                      key={stop.stationId || idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + idx * 0.05 }}
                      className="flex items-center gap-3"
                    >
                      <div className={cn(
                        'w-3 h-3 rounded-full flex-shrink-0',
                        isSelected ? 'bg-blue-500 shadow-lg shadow-blue-500/50' : 'bg-zinc-700 border border-zinc-600'
                      )} />
                      <div className={cn(isSelected ? '' : 'opacity-60')}>
                        <p className={cn(
                          'text-sm',
                          isSelected ? 'font-semibold text-white' : 'text-zinc-400'
                        )}>
                          {stop.station?.name || stop.stationId}
                        </p>
                        <p className="text-xs text-zinc-600">
                          {stop.arrivalTime && `${stop.arrivalTime.slice(0, 5)}`}
                          {stop.arrivalTime && stop.departureTime ? ' – ' : ''}
                          {stop.departureTime && stop.departureTime.slice(0, 5)}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="ml-auto text-[10px] uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                          {isFrom ? (isRTL ? 'صعود' : 'BOARD') : (isRTL ? 'نزول' : 'ALIGHT')}
                        </span>
                      )}
                    </motion.div>
                  )
                })}

                <div className="flex items-center gap-2 text-xs text-zinc-400 pt-2">
                  <Clock size={12} />
                  {formatTime(trip.departure)} – {formatTime(trip.arrival)}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Bus size={12} />
                  {trip.bus?.name}
                </div>
                {tripStops.length > 2 && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Map size={12} />
                    {tripStops.map(s => s.station?.name || s.stationId).join(' · ')}
                  </div>
                )}
              </div>

              {/* Selected seats */}
              <div className="mb-6">
                <h4 className="text-xs text-zinc-500 mb-3 uppercase tracking-wider">{t('seat.selectedSeats')}</h4>
                {selectedSeats.length === 0 ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-zinc-600 flex items-center gap-2 py-4 text-center justify-center"
                  >
                    <span className="text-lg">🪑</span>
                    {t('seat.clickSeat')}
                  </motion.p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <AnimatePresence>
                      {selectedSeats.map((label) => {
                        const seat = layout?.seats.find((s) => s.label === label)
                        const price = (segmentPrice || trip?.price || 0) + (seat?.price || 0)
                        return (
                          <motion.div
                            key={label}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                            className="group relative"
                          >
                            <span className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-mono font-semibold">
                              {label}
                              <span className="text-xs text-blue-400/60 ml-1">+{price.toLocaleString()}</span>
                            </span>
                            <button
                              onClick={() => toggleSeat(label)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 hover:bg-red-500 hover:scale-110"
                            >
                              <X size={10} />
                            </button>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Passenger name & phone inputs */}
              <AnimatePresence>
                {selectedSeats.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-white/5 pt-4 mb-6"
                  >
                    <h4 className="text-xs text-zinc-500 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                      <User size={12} />
                      {isRTL ? 'بيانات المسافرين' : 'Passenger Details'}
                    </h4>
                    {selectedSeats.length === 1 ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={passengerNames[selectedSeats[0]] ?? session?.user?.name ?? ''}
                          onChange={(e) => setPassengerNames((p) => ({ ...p, [selectedSeats[0]]: e.target.value }))}
                          placeholder={session?.user?.name ?? (isRTL ? 'اسم المسافر' : 'Passenger name')}
                          className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                        <input
                          type="tel"
                          value={passengerPhones[selectedSeats[0]] ?? ''}
                          onChange={(e) => setPassengerPhones((p) => ({ ...p, [selectedSeats[0]]: e.target.value }))}
                          placeholder={isRTL ? 'رقم التليفون (اختياري)' : 'Phone number (optional)'}
                          className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                        <input
                          type="text"
                          value={passengerHotels[selectedSeats[0]] ?? ''}
                          onChange={(e) => setPassengerHotels((p) => ({ ...p, [selectedSeats[0]]: e.target.value }))}
                          placeholder={isRTL ? 'اسم الفندق (اختياري)' : 'Hotel name (optional)'}
                          className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedSeats.map((label) => (
                          <div key={label} className="flex items-center gap-2">
                            <span className="w-9 text-center text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md py-1 flex-shrink-0">
                              {label}
                            </span>
                            <input
                              type="text"
                              value={passengerNames[label] ?? ''}
                              onChange={(e) => setPassengerNames((p) => ({ ...p, [label]: e.target.value }))}
                              placeholder={isRTL ? 'الاسم' : 'Name'}
                              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                            />
                            <input
                              type="tel"
                              value={passengerPhones[label] ?? ''}
                              onChange={(e) => setPassengerPhones((p) => ({ ...p, [label]: e.target.value }))}
                              placeholder={isRTL ? 'التليفون' : 'Phone'}
                              className="w-24 px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors flex-shrink-0"
                            />
                            <input
                              type="text"
                              value={passengerHotels[label] ?? ''}
                              onChange={(e) => setPassengerHotels((p) => ({ ...p, [label]: e.target.value }))}
                              placeholder={isRTL ? 'الفندق' : 'Hotel'}
                              className="w-24 px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors flex-shrink-0"
                            />
                          </div>
                        ))}
                      </div>
                    )}
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
                    className="border-t border-white/5 pt-4 mb-6 space-y-2 text-sm"
                  >
                    {selectedSeats.map((label) => {
                      const seat = layout?.seats.find((s) => s.label === label)
                      const price = (segmentPrice || trip?.price || 0) + (seat?.price || 0)
                      return (
                        <motion.div
                          key={label}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex justify-between"
                        >
                          <span className="text-zinc-400">
                            <span className="font-mono">{label}</span>
                            {seat?.type === 'VIP' && (
                              <span className="ml-2 text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">VIP</span>
                            )}
                          </span>
                          <span className="text-white font-medium">{price.toLocaleString()} {t('common.currency')}</span>
                        </motion.div>
                      )
                    })}
                    <div className="flex justify-between font-semibold border-t border-white/10 pt-2 text-white">
                      <span>{t('seat.total')}</span>
                      <span className="text-blue-400 text-lg">{totalPrice.toLocaleString()} {t('common.currency')}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Book button */}
              {isRoundTrip && !showReturnSeats ? (
                <motion.button
                  onClick={() => setShowReturnSeats(true)}
                  disabled={selectedSeats.length === 0}
                  whileHover={selectedSeats.length > 0 ? { scale: 1.02 } : {}}
                  whileTap={selectedSeats.length > 0 ? { scale: 0.98 } : {}}
                  className={cn(
                    'w-full py-4 rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2',
                    selectedSeats.length === 0
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50'
                  )}
                >
                  <Repeat size={16} />
                  {isRTL ? 'التالي: اختر مقاعد العودة' : 'Next: Select Return Seats'}
                </motion.button>
              ) : (
                <motion.button
                  onClick={handleHold}
                  disabled={selectedSeats.length === 0 || booking || (isRoundTrip && returnSelectedSeats.length === 0)}
                  whileHover={selectedSeats.length > 0 ? { scale: 1.02 } : {}}
                  whileTap={selectedSeats.length > 0 ? { scale: 0.98 } : {}}
                  className={cn(
                    'w-full py-4 rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2',
                    (selectedSeats.length === 0 || booking || (isRoundTrip && returnSelectedSeats.length === 0))
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50'
                  )}
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
                      <Sparkles size={16} className="animate-pulse" />
                      {isRTL ? 'تأكيد الحجز' : 'Confirm Booking'} ({selectedSeats.length + returnSelectedSeats.length})
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} className="animate-pulse" />
                      {isRTL ? 'تأكيد الحجز' : 'Confirm Booking'} {selectedSeats.length > 1 ? `(${selectedSeats.length})` : ''}
                    </>
                  )}
                </motion.button>
              )}

              <p className="text-xs text-zinc-600 text-center mt-3 flex items-center justify-center gap-1.5">
                <Check size={12} className="text-emerald-500" />
                {t('seat.cancel')}
              </p>
            </div>
          </motion.div>
        </div>

        {/* ── RETURN TRIP SECTION (round trip only) ─── */}
        {isRoundTrip && showReturnSeats && returnTrip && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-12 pt-8 border-t border-white/5"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl glass border border-blue-500/20">
                <Repeat size={20} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-display font-bold text-white">{t('roundtrip.returnTrip')}</h2>
                <p className="text-xs text-zinc-500">
                  {returnTrip.origin} {isRTL ? '←' : '→'} {returnTrip.destination} · {formatDate(returnTrip.departure)} {formatTime(returnTrip.departure)}
                </p>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1fr,340px] gap-8">
              {/* Return seat map */}
              <div className="glass rounded-3xl p-6 sm:p-10 border border-white/5 shadow-2xl">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-display font-bold text-white">{t('seat.select')}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{returnTrip.bus?.name} · {returnLayout?.seats?.length || 0} seats</p>
                  </div>
                </div>

                <div className="flex items-center justify-center mb-6">
                  <div className="flex items-center gap-2 px-5 py-2.5 rounded-full glass border border-white/5">
                    <span className="text-base">🚍</span>
                    <span className="text-xs font-medium text-zinc-500">{isRTL ? 'الأمام' : 'FRONT OF BUS'}</span>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  {Array.from({ length: returnLayout?.rows || 10 }, (_, rowIdx) => {
                    const rowLetter = ROWS[rowIdx]
                    const rowSeatCount = (() => {
                      if (returnLayout?.colsPerRow) {
                        try { return JSON.parse(returnLayout.colsPerRow)[rowLetter] || 4 } catch { return 4 }
                      }
                      return returnLayout?.cols || 4
                    })()
                    const aislePos = returnLayout?.aisleAfter ?? 2
                    return (
                      <div key={rowIdx} className="flex gap-2">
                        <div className="w-8 flex items-center justify-center text-xs text-zinc-600 font-bold">{rowLetter}</div>
                        {Array.from({ length: rowSeatCount }, (_, colIdx) => {
                          const col = colIdx + 1
                          const seat = getSeatAt(rowIdx, col, returnLayout?.seats)
                          const isAisle = col === aislePos + 1 && rowSeatCount > 3
                          const isSelected = returnSelectedSeats.includes(seat?.label || '')
                          const isReserved = seat && returnReservedSeats.has(seat.label)
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
                          )
                        })}
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => setShowReturnSeats(false)}
                    className="text-xs text-zinc-500 hover:text-white transition flex items-center gap-1 px-4 py-2 rounded-lg hover:bg-white/5"
                  >
                    <ArrowLeft size={12} /> {isRTL ? 'العودة لاختيار مقاعد الذهاب' : 'Back to outbound seats'}
                  </button>
                </div>
              </div>

              {/* Return trip summary */}
              <div>
            <div className="glass rounded-3xl p-6 border border-white/5 shadow-2xl sticky top-28 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-hide">
                  <h3 className="font-display font-bold text-lg mb-1 text-white">{t('roundtrip.returnTrip')}</h3>
                  <p className="text-xs text-zinc-500 mb-4">{returnTrip.bus?.name}</p>

                  <div className="space-y-2 mb-6 text-sm">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-blue-400" />
                      <span className="font-semibold text-white">{returnTrip.origin}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Clock size={12} />
                      {formatDate(returnTrip.departure)} {formatTime(returnTrip.departure)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Bus size={12} />
                      {returnTrip.bus?.name}
                    </div>
                  </div>

                  {/* Return selected seats */}
                  <div className="mb-4">
                    <h4 className="text-xs text-zinc-500 mb-2">{t('seat.selectedSeats')}</h4>
                    {returnSelectedSeats.length === 0 ? (
                      <p className="text-xs text-zinc-600">{t('seat.clickSeat')}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {returnSelectedSeats.map((label) => (
                          <span key={label} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-mono">
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Return passenger names */}
                  {returnSelectedSeats.length > 0 && (
                    <div className="mb-4 space-y-2">
                      <h4 className="text-xs text-zinc-500">{isRTL ? 'بيانات المسافرين' : 'Passenger Details'}</h4>
                      {returnSelectedSeats.map((label) => (
                        <div key={label} className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-blue-400 w-8">{label}</span>
                          <input
                            type="text"
                            value={returnPassengerNames[label] ?? ''}
                            onChange={(e) => setReturnPassengerNames((p) => ({ ...p, [label]: e.target.value }))}
                            placeholder={session?.user?.name || ''}
                            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
                          />
                          <input
                            type="tel"
                            value={returnPassengerPhones[label] ?? ''}
                            onChange={(e) => setReturnPassengerPhones((p) => ({ ...p, [label]: e.target.value }))}
                            placeholder={isRTL ? 'التليفون' : 'Phone'}
                            className="w-24 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
                          />
                          <input
                            type="text"
                            value={returnPassengerHotels[label] ?? ''}
                            onChange={(e) => setReturnPassengerHotels((p) => ({ ...p, [label]: e.target.value }))}
                            placeholder={isRTL ? 'الفندق' : 'Hotel'}
                            className="w-24 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Combined price */}
                  {returnSelectedSeats.length > 0 && (
                    <div className="border-t border-white/5 pt-4 space-y-1 text-sm">
                      <div className="flex justify-between text-zinc-400">
                        <span>{t('roundtrip.outboundTrip')}</span>
                        <span>{totalPrice.toLocaleString()} {t('common.currency')}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>{t('roundtrip.returnTrip')}</span>
                        <span>{returnTotalPrice.toLocaleString()} {t('common.currency')}</span>
                      </div>
                      <div className="flex justify-between font-bold text-white border-t border-white/10 pt-2">
                        <span>{t('roundtrip.totalBoth')}</span>
                        <span className="text-blue-400 text-lg">{(totalPrice + returnTotalPrice).toLocaleString()} {t('common.currency')}</span>
                      </div>
                    </div>
                  )}

                  <motion.button
                    onClick={handleHold}
                    disabled={returnSelectedSeats.length === 0 || booking}
                    whileHover={returnSelectedSeats.length > 0 ? { scale: 1.02 } : {}}
                    whileTap={returnSelectedSeats.length > 0 ? { scale: 0.98 } : {}}
                    className={cn(
                      'w-full py-4 rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 mt-4',
                      returnSelectedSeats.length === 0 || booking
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50'
                    )}
                  >
                    {booking ? (
                      <><Loader2 size={18} className="animate-spin" /> {t('common.loading')}</>
                    ) : (
                      <><Sparkles size={16} /> {isRTL ? 'تأكيد الحجز' : 'Confirm Booking'} ({selectedSeats.length + returnSelectedSeats.length})</>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

// Premium seat button with all micro-interactions
function SeatButton({ seat, isSelected, isReserved, onToggle, tripPrice, t }: any) {
  return (
    <motion.div
      whileHover={!isReserved && !isSelected ? { scale: 1.2, y: -3 } : {}}
      whileTap={!isReserved ? { scale: 0.85 } : {}}
      onClick={() => !isReserved && onToggle(seat.label)}
      className={cn(
        'relative w-11 h-11 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-200 cursor-pointer',
        isReserved
          ? 'seat-reserved z-10'
          : isSelected
          ? 'seat-selected z-20 animate-seat-bounce-glow'
          : seat.type === 'VIP'
          ? 'seat-vip'
          : 'seat-available'
      )}
      title={`${seat.label}${seat.type === 'VIP' ? ' (VIP)' : ''} — ${(tripPrice + (seat.price || 0)).toLocaleString()} ${t('common.currency')}`}
      data-segment-price={tripPrice}
    >
      {seat.label}
      {/* Reserved X overlay */}
      {isReserved && (
        <motion.div
          initial={{ opacity: 0, rotate: -45 }}
          animate={{ opacity: 1, rotate: 0 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="w-3 h-0.5 bg-red-500/60 rotate-45" />
        </motion.div>
      )}
      {/* Glow ring on hover */}
      {!isReserved && !isSelected && (
        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </motion.div>
  )
}

// Confirmation modal card
function ConfirmationCard({ t, isRTL, confirmedBookings, trip, formatDate, formatTime, onClose, onBookAnother, onViewBookings }: any) {
  const isMulti = confirmedBookings.length > 1
  const first = confirmedBookings[0]
  const busName = first?.trip?.bus?.name || trip?.bus?.name || '-'
  const totalAmount = confirmedBookings.reduce((sum: number, b: any) => sum + (b.total || 0), 0)

  return (
    <div className={cn(
      'glass rounded-3xl border border-emerald-500/10 shadow-2xl shadow-emerald-500/10',
      isRTL ? 'text-right' : 'text-left'
    )} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="relative p-6 pb-4 border-b border-white/5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-white/10 text-zinc-500 hover:text-white transition"
        >
          <X size={18} />
        </button>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
          className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/30"
        >
          <Check size={32} className="text-white" />
        </motion.div>
        <h2 className={cn('text-xl font-display font-bold text-white mb-1', isRTL && 'font-[Cairo]')}>
          {t('confirmed.title')}
        </h2>
        <p className={cn('text-sm text-zinc-400', isRTL && 'font-[Cairo]')}>
          {t('confirmed.desc')}
        </p>
      </div>

      {/* Details */}
      <div className="p-6 space-y-4 text-sm">
        {/* Bus */}
        <div className="flex justify-between items-center">
          <span className="text-zinc-500">{isRTL ? 'رقم الباص' : 'Bus'}</span>
          <div className="flex items-center gap-2 text-white">
            <Bus size={14} className="text-purple-400" />
            {busName}
          </div>
        </div>

        {/* Route */}
        <div className="flex justify-between items-center">
          <span className="text-zinc-500">{isRTL ? 'المسار' : 'Route'}</span>
          <div className="flex items-center gap-2 text-white">
            <MapPin size={14} className="text-blue-400" />
            {trip.origin}
            <span className="text-zinc-600 mx-1">{isRTL ? '←' : '→'}</span>
            {trip.destination}
          </div>
        </div>

        {/* Departure */}
        <div className="flex justify-between items-center">
          <span className="text-zinc-500">{isRTL ? 'موعد الرحلة' : 'Departure'}</span>
          <div className="text-white">
            <span>{formatDate(trip.departure)}</span>
            <span className="text-zinc-500 text-xs mx-1">·</span>
            <span className="text-zinc-400 text-sm">{formatTime(trip.departure)}</span>
          </div>
        </div>

        {isMulti ? (
          <div className="pt-2 border-t border-white/5 space-y-3">
            {confirmedBookings.map((booking: any) => (
              <div key={booking.id} className="flex justify-between items-center bg-zinc-800/40 rounded-xl p-3">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-blue-400 text-sm font-bold bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    {booking.reference}
                  </span>
                  <span className="text-zinc-500 text-xs">
                    {isRTL ? 'مقعد' : 'Seat'}
                    <span className="font-mono text-white ml-1">{booking.seatLabel}</span>
                  </span>
                </div>
                <span className="text-white font-semibold text-base">
                  {Math.round(booking.total).toLocaleString()} {t('common.currency')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center pb-3 border-b border-white/5">
              <span className="text-zinc-500">{isRTL ? 'كود الحجز' : 'Booking Code'}</span>
              <span className="font-mono text-blue-400 text-lg font-bold tracking-wider bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20">
                {first.reference}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">{isRTL ? 'رقم المقعد' : 'Seat'}</span>
              <span className="inline-flex px-3 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 font-mono font-bold text-lg">
                {first.seatLabel}
              </span>
            </div>
          </>
        )}

        {/* Total */}
        <div className="flex justify-between items-center pt-3 border-t border-white/5">
          <span className="font-semibold text-white">{t('confirmed.totalPaid')}</span>
          <span className="text-2xl font-display font-bold text-emerald-400">
            {Math.round(totalAmount).toLocaleString()} {t('common.currency')}
          </span>
        </div>

        {/* Payment note */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400/80">
          {isRTL ? 'سيتم تأكيد الحجز بعد استلام الأدمن للدفع' : 'Booking will be confirmed after admin receives payment'}
        </div>
      </div>

      {/* Actions */}
      <div className="p-6 pt-4 flex flex-col sm:flex-row gap-3">
        <button
          onClick={onViewBookings}
          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
        >
          <Ticket size={16} />
          {isRTL ? 'عرض حجوزاتي' : 'View My Bookings'}
        </button>
        <button
          onClick={onBookAnother}
          className="flex-1 py-3 rounded-xl glass border border-white/10 hover:bg-white/5 text-zinc-300 font-medium text-sm transition-all flex items-center justify-center gap-2"
        >
          <Sparkles size={16} />
          {t('confirmed.bookAnother')}
        </button>
      </div>
    </div>
  )
}