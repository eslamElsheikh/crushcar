'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Clock, MapPin, Loader2, Check, Bus, Sparkles, X, User } from 'lucide-react'
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

interface Trip {
  id: string
  origin: string
  destination: string
  departure: string
  arrival: string
  price: number
  status: string
  bus: {
    id: string
    name: string
    type: string
    layout?: {
      rows: number
      cols: number
      aisleAfter: number
      colsPerRow: string
      seats: Seat[]
    }
  }
  bookings: { seatLabel: string }[]
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
const AISLE_AFTER = 2

export default function TripDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.id as string
  const { data: session } = useSession()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSeats, setSelectedSeats] = useState<string[]>([])
  const [passengerNames, setPassengerNames] = useState<Record<string, string>>({})
  const [booking, setBooking] = useState(false)
  const [confirmedBookings, setConfirmedBookings] = useState<any[]>([])
  const [lastToast, setLastToast] = useState<string>('')

  async function loadTrip() {
    try {
      const res = await fetch(`/api/trips/${tripId}`)
      const data = await res.json()
      setTrip(data)
    } catch {
      // silently fail on poll
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTrip()
  }, [tripId])

  // Realtime polling + notifications
  useEffect(() => {
    const interval = setInterval(loadTrip, 5000)
    return () => clearInterval(interval)
  }, [tripId])

  useEffect(() => {
    if (!trip) return
    const reserved = new Set(trip.bookings.map((b) => b.seatLabel))
    const nowReserved = selectedSeats.filter((s) => reserved.has(s))
    if (nowReserved.length > 0) {
      const msg = `${t('seat.reserved')} ${nowReserved[0]}`
      if (msg !== lastToast) {
        setSelectedSeats((prev) => prev.filter((s) => !reserved.has(s)))
        toast.error(msg)
        setLastToast(msg)
      }
    }
  }, [trip, t])

  const reservedSeats = new Set(trip?.bookings.map((b) => b.seatLabel) || [])
  const layout = trip?.bus?.layout

  function toggleSeat(label: string) {
    if (reservedSeats.has(label)) return
    setSelectedSeats((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    )
  }

  async function handleBook() {
    if (selectedSeats.length === 0) return
    if (!session) {
      toast.error(isRTL ? 'سجل دخول أولاً' : 'Please sign in first')
      router.push('/login')
      return
    }
    setBooking(true)

    const seats = selectedSeats.map((seatLabel) => ({
      seatLabel,
      passengerName: passengerNames[seatLabel] || session.user?.name || '',
    }))

    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, seats }),
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      } else {
        toast.error(data.error || t('common.error'))
      }
    } catch {
      toast.error(t('common.error'))
    }
    setBooking(false)
  }

  function getSeatAt(rowIdx: number, col: number): Seat | undefined {
    return layout?.seats.find((s) => s.row === rowIdx && s.col === col)
  }

  const totalPrice = selectedSeats.reduce((sum, label) => {
    const seat = layout?.seats.find((s) => s.label === label)
    return sum + (trip?.price || 0) + (seat?.price || 0)
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

  if (confirmedBookings.length > 0) {
    return <ConfirmedScreen t={t} isRTL={isRTL} confirmedBookings={confirmedBookings} trip={trip} formatDate={formatDate} formatTime={formatTime} />
  }

  return (
    <div className="min-h-screen bg-[#030303] text-foreground overflow-x-hidden">
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
              <span className="text-zinc-600 mx-1">→</span>
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

              {/* Column numbers - dynamic based on max seats */}
              <div className="flex gap-2 mb-3 pl-8">
                {Array.from({ length: layout?.cols || 4 }, (_, i) => (
                  <div key={i} className="w-11 text-center text-xs text-zinc-600 font-medium">{i + 1}</div>
                ))}
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
                              tripPrice={trip?.price || 0}
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
            <div className="glass rounded-3xl p-6 border border-white/5 shadow-2xl sticky top-28">
              <h3 className={cn(
                'font-display font-bold text-lg mb-1 text-white',
                isRTL && 'font-[Cairo]'
              )}>
                {t('seat.summary')}
              </h3>
              <p className="text-xs text-zinc-500 mb-6">{t('search.desc')}</p>

              {/* Route visualization */}
              <div className="space-y-3 mb-6 text-sm">
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-3 h-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-white">{trip.origin}</p>
                    <p className="text-xs text-zinc-500">{formatDate(trip.departure)}</p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="ml-1.5 w-0.5 h-5 bg-gradient-to-b from-blue-500 to-emerald-500 rounded"
                />

                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.45 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-white">{trip.destination}</p>
                    <p className="text-xs text-zinc-500">{formatTime(trip.arrival)} {t('trips.arrival')}</p>
                  </div>
                </motion.div>

                <div className="flex items-center gap-2 text-xs text-zinc-400 pt-2">
                  <Clock size={12} />
                  {formatTime(trip.departure)} – {formatTime(trip.arrival)}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Bus size={12} />
                  {trip.bus?.name}
                </div>
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
                        const price = (trip?.price || 0) + (seat?.price || 0)
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

              {/* Passenger name inputs */}
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
                      {isRTL ? 'اسم المسافر' : 'Passenger Name'}
                    </h4>
                    {selectedSeats.length === 1 ? (
                      <input
                        type="text"
                        value={passengerNames[selectedSeats[0]] ?? session?.user?.name ?? ''}
                        onChange={(e) => setPassengerNames((p) => ({ ...p, [selectedSeats[0]]: e.target.value }))}
                        placeholder={session?.user?.name ?? (isRTL ? 'اسم المسافر' : 'Passenger name')}
                        className="w-full px-4 py-2.5 rounded-xl bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                      />
                    ) : (
                      <div className="space-y-3">
                        {selectedSeats.map((label) => (
                          <div key={label} className="flex items-center gap-3">
                            <span className="w-10 text-center text-sm font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg py-1.5 flex-shrink-0">
                              {label}
                            </span>
                            <input
                              type="text"
                              value={passengerNames[label] ?? ''}
                              onChange={(e) => setPassengerNames((p) => ({ ...p, [label]: e.target.value }))}
                              placeholder={isRTL ? `اسم راكب ${label}` : `Passenger for seat ${label}`}
                              className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors"
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
                      const price = (trip?.price || 0) + (seat?.price || 0)
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
              <motion.button
                onClick={handleBook}
                disabled={selectedSeats.length === 0 || booking}
                whileHover={selectedSeats.length > 0 ? { scale: 1.02 } : {}}
                whileTap={selectedSeats.length > 0 ? { scale: 0.98 } : {}}
                className={cn(
                  'w-full py-4 rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2',
                  selectedSeats.length === 0 || booking
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
                ) : (
                  <>
                    <Sparkles size={16} className="animate-pulse" />
                    {t('seat.bookBtn')} {selectedSeats.length > 1 ? `(${selectedSeats.length})` : ''}
                  </>
                )}
              </motion.button>

              <p className="text-xs text-zinc-600 text-center mt-3 flex items-center justify-center gap-1.5">
                <Check size={12} className="text-emerald-500" />
                {t('seat.cancel')}
              </p>
            </div>
          </motion.div>
        </div>
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

// Confirmed booking screen
function ConfirmedScreen({ t, isRTL, confirmedBookings, trip, formatDate, formatTime }: any) {
  const isMulti = confirmedBookings.length > 1
  const first = confirmedBookings[0]
  const busName = first?.trip?.bus?.name || trip?.bus?.name || '-'
  const totalAmount = confirmedBookings.reduce((sum: number, b: any) => sum + (b.total || 0), 0)

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 100 }}
        className="text-center max-w-md relative z-10"
      >
        {/* Success animation */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/30"
        >
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-pulse" />
          <Check size={40} className="text-white relative z-10" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className={cn(
            'text-3xl font-display font-bold mb-3 text-white',
            isRTL && 'font-[Cairo]'
          )}
        >
          {t('confirmed.title')}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className={cn('text-zinc-400 mb-8', isRTL && 'font-[Cairo]')}
        >
          {t('confirmed.desc')}
        </motion.p>

        {/* Booking details card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className={cn(
            'glass rounded-3xl p-8 mb-8 text-left border border-emerald-500/10 shadow-2xl shadow-emerald-500/10',
            isRTL && 'text-right'
          )}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <div className="space-y-4 text-sm">
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
                <span className="text-zinc-600 mx-1">→</span>
                {trip.destination}
              </div>
            </div>

            {/* Departure Date */}
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">{isRTL ? 'موعد الرحلة' : 'Departure'}</span>
              <div className="text-white">
                <span>{formatDate(trip.departure)}</span>
                <span className="text-zinc-500 text-xs mx-1">·</span>
                <span className="text-zinc-400 text-sm">{formatTime(trip.departure)}</span>
              </div>
            </div>

            {isMulti ? (
              <>
                {/* Multiple bookings: show each seat + code */}
                <div className="pt-2 border-t border-white/5 space-y-3">
                  {confirmedBookings.map((booking: any, i: number) => (
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
              </>
            ) : (
              <>
                {/* Single booking */}
                <div className="flex justify-between items-center pb-3 border-b border-white/5">
                  <span className="text-zinc-500">{isRTL ? 'كود الحجز' : 'Booking Code'}</span>
                  <span className="font-mono text-blue-400 text-lg font-bold tracking-wider bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20">
                    {first.reference}
                  </span>
                </div>

                {/* Seat */}
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">{isRTL ? 'رقم المقعد' : 'Seat'}</span>
                  <span className="inline-flex px-3 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 font-mono font-bold text-lg">
                    {first.seatLabel}
                  </span>
                </div>

                {/* Paid At */}
                {first.paidAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">{isRTL ? 'وقت الدفع' : 'Paid At'}</span>
                    <div className="text-emerald-400 text-xs">
                      <span>{formatDate(first.paidAt)}</span>
                      <span className="text-zinc-600 mx-1">·</span>
                      <span className="text-zinc-500">{formatTime(first.paidAt)}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Total */}
            <div className="flex justify-between items-center pt-3 border-t border-white/5">
              <span className="font-semibold text-white">{t('confirmed.totalPaid')}</span>
              <span className="text-2xl font-display font-bold text-emerald-400">
                {Math.round(totalAmount).toLocaleString()} {t('common.currency')}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Link
            href="/trips"
            className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold text-sm transition-all hover:scale-105 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
          >
            <Sparkles size={16} />
            {t('confirmed.bookAnother')}
          </Link>
          <Link
            href="/"
            className="flex-1 py-3.5 rounded-xl glass border border-white/10 hover:bg-white/5 text-zinc-300 font-medium text-sm transition-all flex items-center justify-center gap-2"
          >
            {isRTL ? 'الرئيسية' : 'Home'}
          </Link>
        </motion.div>
      </motion.div>
    </div>
  )
}