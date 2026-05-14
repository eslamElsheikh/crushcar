'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Bus, MapPin, CheckCircle2, Clock, Loader2, RefreshCw, Armchair } from 'lucide-react'
import { formatDate, formatTime, cn } from '@/lib/utils'
import { useLangStore } from '@/lib/lang'

interface Seat {
  id: string
  label: string
  row: number
  col: number
  type: string
  price: number
}

interface Booking {
  id: string
  reference: string
  seatLabel: string
  passengerName: string
  status: string
  total: number
  paidAt: string | null
  boarded: boolean
  boardedAt: string | null
  user: { id: string; name: string; email: string }
}

interface Trip {
  id: string
  origin: string
  destination: string
  departure: string
  arrival: string
  status: string
  bus: {
    id: string
    name: string
    type: string
    seatCount: number
    layout?: {
      rows: number
      cols: number
      aisleAfter: number
      colsPerRow: string
      seats: Seat[]
    }
  }
  bookings: Booking[]
}

export default function TripSeatsPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.id as string
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null)

  useEffect(() => { loadTrip() }, [tripId])

  async function loadTrip() {
    setLoading(true)
    try {
      const res = await fetch(`/api/trips/${tripId}`, { credentials: 'include' })
      if (res.ok) setTrip(await res.json())
    } catch {}
    setLoading(false)
  }

  async function markBoarded(bookingId: string) {
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'BOARDED' }),
      credentials: 'include',
    })
    if (res.ok) {
      const updated = await res.json()
      setTrip(prev => prev ? {
        ...prev,
        bookings: prev.bookings.map(b => b.id === bookingId ? { ...b, ...updated, boarded: true } : b)
      } : null)
      setSelectedSeat(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!trip) return null

  const layout = trip.bus?.layout
  const bookedMap = new Map(trip.bookings.map(b => [b.seatLabel, b]))
  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

  const totalSeats = trip.bus.seatCount
  const bookedCount = trip.bookings.length
  const boardedCount = trip.bookings.filter(b => b.boarded).length

  function getSeatAt(rowIdx: number, col: number): Seat | undefined {
    return layout?.seats.find(s => s.row === rowIdx && s.col === col)
  }

  function getRowSeatCount(rowLetter: string): number {
    if (layout?.colsPerRow) {
      try {
        const parsed = JSON.parse(layout.colsPerRow)
        return parsed[rowLetter] || layout.cols || 4
      } catch { /* fall through */ }
    }
    return layout?.cols || 4
  }

  const selectedBooking = selectedSeat ? bookedMap.get(selectedSeat.label) : null

  return (
    <div className={cn('max-w-6xl mx-auto', isRTL && 'font-[Cairo]')}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
        <button onClick={() => router.push('/admin/trips')} className="p-2.5 rounded-xl glass hover:bg-zinc-800/50 border border-white/5 transition">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Armchair size={20} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-white">
              {isRTL ? 'خريطة المقاعد' : 'Seat Map'}
            </h1>
            <p className="text-zinc-400 text-sm">
              {trip.origin} → {trip.destination} · {trip.bus?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Clock size={14} />
          {formatDate(trip.departure)} {formatTime(trip.departure)}
        </div>
        <button onClick={loadTrip} className="p-2 rounded-xl glass hover:bg-zinc-800/50 border border-white/5 transition text-zinc-400 hover:text-white">
          <RefreshCw size={18} />
        </button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: isRTL ? 'المقاعد المحجوزة' : 'Booked', value: `${bookedCount}/${totalSeats}`, color: '#3b82f6' },
          { label: isRTL ? 'المقاعد المتاحة' : 'Available', value: totalSeats - bookedCount, color: '#10b981' },
          { label: isRTL ? 'الصعود' : 'Boarded', value: boardedCount, color: '#a855f7' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="rounded-2xl glass border border-white/10 p-4 text-center">
            <p className="text-xs text-zinc-400 mb-1">{stat.label}</p>
            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-6 text-xs">
        {[
          { label: isRTL ? 'متاح' : 'Available', cls: 'seat-available border' },
          { label: isRTL ? 'محجوز' : 'Booked', cls: 'seat-reserved' },
          { label: isRTL ? 'صعد' : 'Boarded', cls: 'seat-boarded' },
          { label: isRTL ? 'VIP' : 'VIP', cls: 'seat-vip border' },
        ].map(item => (
          <span key={item.label} className={cn('px-3 py-1.5 rounded-lg', item.cls)}>{item.label}</span>
        ))}
      </div>

      <div className="flex gap-8">
        {/* Seat Map */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex-1">
          <div className="glass rounded-3xl p-8 border border-white/5 shadow-2xl shadow-purple-500/5">
            {/* Bus front */}
            <div className="flex items-center justify-center mb-6">
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-full glass border border-white/5">
                <span className="text-base">🚌</span>
                <span className="text-xs font-medium text-zinc-500">{isRTL ? 'الأمام' : 'FRONT OF BUS'}</span>
              </div>
            </div>

            {/* Column numbers */}
            <div className="flex gap-2 mb-3 pl-8">
              {Array.from({ length: layout?.cols || 4 }, (_, i) => (
                <div key={i} className="w-12 text-center text-xs text-zinc-600 font-medium">{i + 1}</div>
              ))}
            </div>

            {/* Seat grid */}
            <div className="flex flex-col items-center gap-1.5">
              {Array.from({ length: layout?.rows || 10 }, (_, rowIdx) => {
                const rowLetter = ROWS[rowIdx]
                const rowSeatCount = getRowSeatCount(rowLetter)
                const aislePos = layout?.aisleAfter ?? 2

                return (
                  <motion.div key={rowIdx} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + rowIdx * 0.03 }} className="flex gap-2">
                    {/* Row label */}
                    <div className="w-7 flex items-center justify-center text-xs text-zinc-600 font-bold">{rowLetter}</div>

                    {Array.from({ length: rowSeatCount }, (_, colIdx) => {
                      const col = colIdx + 1
                      const seat = getSeatAt(rowIdx, col)
                      const isAisle = col === aislePos + 1 && rowSeatCount > 3
                      const booking = seat ? bookedMap.get(seat.label) : null
                      const isBoarded = booking?.boarded

                      return (
                        <div key={colIdx} className={cn('flex gap-2', isAisle ? 'ml-10' : '')}>
                          {seat ? (
                            <button
                              onClick={() => setSelectedSeat(seat)}
                              className={cn(
                                'relative w-12 h-12 rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all duration-200 cursor-pointer',
                                isBoarded
                                  ? 'seat-boarded'
                                  : booking
                                  ? 'seat-reserved'
                                  : seat.type === 'VIP'
                                  ? 'seat-vip'
                                  : 'seat-available',
                                selectedSeat?.id === seat.id && 'ring-2 ring-purple-400 ring-offset-2 ring-offset-zinc-900'
                              )}
                              title={booking ? `${booking.passengerName || booking.user?.name} (${booking.seatLabel})` : seat.label}
                            >
                              <span className="font-mono">{seat.label}</span>
                              {booking && (
                                <span className="text-[8px] font-semibold mt-0.5 leading-tight text-center px-0.5 overflow-hidden">
                                  {booking.passengerName || booking.user?.name?.split(' ')[0] || booking.seatLabel}
                                </span>
                              )}
                              {isBoarded && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                                  <CheckCircle2 size={8} className="text-white" />
                                </div>
                              )}
                            </button>
                          ) : (
                            <div className="w-12 h-12" />
                          )}
                        </div>
                      )
                    })}
                  </motion.div>
                )
              })}
            </div>

            {/* Aisle */}
            <div className="flex justify-center mt-4">
              <div className="text-[10px] text-zinc-700 uppercase tracking-widest px-3 py-1 rounded">
                {isRTL ? 'الممر' : 'AISLE'}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Seat Detail Panel */}
        <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
          className="w-72 shrink-0">
          <div className="glass rounded-3xl p-6 border border-white/5 sticky top-28">
            {!selectedSeat ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mx-auto mb-4">
                  <Armchair size={24} className="text-zinc-600" />
                </div>
                <p className="text-sm text-zinc-500">{isRTL ? 'اضغط على مقعد لرؤية التفاصيل' : 'Click a seat to view details'}</p>
              </div>
            ) : !selectedBooking ? (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white">{selectedSeat.label}</h3>
                  {selectedSeat.type === 'VIP' && (
                    <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">VIP</span>
                  )}
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{isRTL ? 'النوع' : 'Type'}</span>
                    <span className="text-white">{selectedSeat.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{isRTL ? 'السعر' : 'Price'}</span>
                    <span className="text-emerald-400 font-bold">{selectedSeat.price?.toLocaleString() || trip.bus?.name} {isRTL ? 'ج.م' : 'EGP'}</span>
                  </div>
                </div>
                <div className="mt-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <CheckCircle2 size={20} className="text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-emerald-400 font-semibold">{isRTL ? 'المقعد متاح' : 'Seat Available'}</p>
                  <p className="text-xs text-zinc-500 mt-1">{isRTL ? 'لم يتم حجز هذا المقعد بعد' : 'Not yet booked'}</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-white font-mono">{selectedSeat.label}</h3>
                    <span className="text-xs text-zinc-500">{isRTL ? 'مقعد محجوز' : 'Reserved Seat'}</span>
                  </div>
                  {selectedBooking.boarded ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 size={10} /> {isRTL ? 'صعد' : 'Boarded'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Clock size={10} /> {isRTL ? 'بانتظار' : 'Waiting'}
                    </span>
                  )}
                </div>

                {/* Passenger info */}
                <div className="mb-6">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold mx-auto mb-3">
                    {(selectedBooking.passengerName || selectedBooking.user?.name).charAt(0).toUpperCase()}
                  </div>
                  <p className="text-center font-semibold text-white text-lg">
                    {selectedBooking.passengerName || selectedBooking.user?.name}
                  </p>
                  <p className="text-center text-xs text-zinc-500 mt-1">{selectedBooking.user?.email}</p>
                </div>

                <div className="space-y-2 text-sm border-t border-white/5 pt-4">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{isRTL ? 'كود الحجز' : 'Ref'}</span>
                    <span className="font-mono text-blue-400 text-xs">{selectedBooking.reference}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{isRTL ? 'السعر' : 'Price'}</span>
                    <span className="text-emerald-400 font-bold">{selectedBooking.total?.toLocaleString()} {isRTL ? 'ج.م' : 'EGP'}</span>
                  </div>
                  {selectedBooking.passengerName && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">{isRTL ? 'المسافر' : 'Passenger'}</span>
                      <span className="text-amber-400/80 text-xs bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {selectedBooking.passengerName}
                      </span>
                    </div>
                  )}
                  {selectedBooking.paidAt && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">{isRTL ? 'وقت الدفع' : 'Paid At'}</span>
                      <span className="text-emerald-500 text-xs">
                        {new Date(selectedBooking.paidAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                        {' '}
                        {new Date(selectedBooking.paidAt).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>

                {!selectedBooking.boarded && selectedBooking.status === 'PAID' && (
                  <button
                    onClick={() => markBoarded(selectedBooking.id)}
                    className="w-full mt-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-all flex items-center justify-center gap-2 hover-lift"
                  >
                    <CheckCircle2 size={16} />
                    {isRTL ? 'تأكيد الصعود' : 'Confirm Boarding'}
                  </button>
                )}
                {selectedBooking.boarded && selectedBooking.boardedAt && (
                  <div className="mt-6 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <CheckCircle2 size={16} className="text-emerald-400 mx-auto mb-1" />
                    <p className="text-xs text-emerald-400 font-semibold">
                      {isRTL ? 'تم الصعود في' : 'Boarded at'}
                    </p>
                    <p className="text-xs text-emerald-500 mt-0.5">
                      {new Date(selectedBooking.boardedAt).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}