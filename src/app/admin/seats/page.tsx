'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Armchair, Bus, MapPin, Clock, Search, Filter, CheckCircle2 } from 'lucide-react'
import { formatDate, formatTime, cn } from '@/lib/utils'
import { useLangStore } from '@/lib/lang'

interface Trip {
  id: string
  origin: string
  destination: string
  departure: string
  arrival: string
  status: string
  bus: { id: string; name: string; seatCount: number }
  _count?: { bookings: number }
}

interface Booking {
  id: string
  reference: string
  seatLabel: string
  passengerName: string
  status: string
  total: number
  boarded: boolean
  user: { id: string; name: string; email: string }
}

interface AggregatedTrip extends Trip {
  bookings: Booking[]
}

export default function SeatsDashboardPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [tripBookings, setTripBookings] = useState<Record<string, Booking[]>>({})
  const [loading, setLoading] = useState(true)
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'booked' | 'available'>('all')
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  useEffect(() => { loadTrips() }, [])

  async function loadTrips() {
    setLoading(true)
    try {
      const res = await fetch('/api/trips')
      const data = await res.json()
      const allTrips: Trip[] = Array.isArray(data) ? data : data.data || []

      // Filter to upcoming + in-progress only
      const upcoming = allTrips.filter((t: Trip) =>
        t.status === 'SCHEDULED' || t.status === 'IN_PROGRESS'
      )
      setTrips(upcoming)

      // Load bookings for each trip
      const bookingsMap: Record<string, Booking[]> = {}
      await Promise.all(
        upcoming.map(async (trip: Trip) => {
          try {
            const r = await fetch(`/api/trips/${trip.id}`, { credentials: 'include' })
            if (r.ok) {
              const full: AggregatedTrip = await r.json()
              bookingsMap[trip.id] = full.bookings || []
            }
          } catch {}
        })
      )
      setTripBookings(bookingsMap)
    } catch {}
    setLoading(false)
  }

  function toggleExpand(tripId: string) {
    setExpandedTrip(prev => prev === tripId ? null : tripId)
  }

  const allStats = (() => {
    let booked = 0
    let total = 0
    let boarded = 0
    Object.values(tripBookings).forEach(bookings => {
      bookings.forEach(b => {
        if (b.status !== 'CANCELLED') {
          booked++
          if (b.boarded) boarded++
        }
      })
    })
    trips.forEach(t => { total += t.bus.seatCount || 0 })
    return { booked, available: total - booked, boarded, total }
  })()

  const filteredTrips = trips.filter(t => {
    const match = t.origin.toLowerCase().includes(search.toLowerCase()) ||
      t.destination.toLowerCase().includes(search.toLowerCase()) ||
      t.bus?.name?.toLowerCase().includes(search.toLowerCase())
    return match
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={cn(isRTL && 'font-[Cairo]')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold">{isRTL ? 'خريطة المقاعد' : 'Seats Dashboard'}</h1>
          <p className="text-zinc-400 mt-1">{isRTL ? 'كل المقاعد في كل الرحلات' : 'All seats across all trips'}</p>
        </div>
        <div className="relative">
          <Search size={16} className={cn('absolute top-1/2 -translate-y-1/2 text-zinc-500', isRTL ? 'right-3' : 'left-3')} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={cn('pl-9 pr-4 py-2.5 rounded-xl glass text-sm focus:outline-none focus:border-blue-500 border border-zinc-800 w-72 transition', isRTL && 'pr-9 pl-4')}
            placeholder={isRTL ? 'ابحث بالمسار أو اسم الباص...' : 'Search by route or bus name...'}
          />
        </div>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: isRTL ? 'المقاعد المحجوزة' : 'Booked', value: allStats.booked, color: '#3b82f6' },
          { label: isRTL ? 'المقاعد المتاحة' : 'Available', value: allStats.available, color: '#10b981' },
          { label: isRTL ? 'الصعود' : 'Boarded', value: allStats.boarded, color: '#a855f7' },
          { label: isRTL ? 'إجمالي المقاعد' : 'Total Seats', value: allStats.total, color: '#71717a' },
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

      {/* Trips accordion */}
      {filteredTrips.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 glass rounded-2xl">
          <Armchair size={48} className="mx-auto text-zinc-700 mb-4" />
          <h3 className="text-lg font-medium mb-2">{isRTL ? 'مفيش رحلات' : 'No trips found'}</h3>
          <p className="text-zinc-500 text-sm">{isRTL ? 'كل المقاعد هتظهر هنا' : 'All seats will appear here'}</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {filteredTrips.map((trip, i) => {
            const isOpen = expandedTrip === trip.id
            const bookings = tripBookings[trip.id] || []
            const bookedSeats = new Set(bookings.filter(b => b.status !== 'CANCELLED').map(b => b.seatLabel))
            const boardedSeats = new Set(bookings.filter(b => b.boarded).map(b => b.seatLabel))
            const bookedCount = bookedSeats.size
            const boardedCount = boardedSeats.size
            const seatCount = trip.bus.seatCount || 0
            const occupancy = seatCount > 0 ? Math.round((bookedCount / seatCount) * 100) : 0

            return (
              <motion.div
                key={trip.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-2xl border border-white/5 overflow-hidden"
              >
                {/* Trip row - always visible */}
                <button
                  onClick={() => toggleExpand(trip.id)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/3 transition"
                >
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform',
                    isOpen ? 'bg-blue-500/20' : 'bg-blue-500/10'
                  )}>
                    <Armchair size={18} className={cn(isOpen ? 'text-blue-400' : 'text-blue-400/60')} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-semibold text-white">{trip.origin}</span>
                      <span className="text-zinc-600">→</span>
                      <span className="font-semibold text-white">{trip.destination}</span>
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Bus size={11} /> {trip.bus?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatDate(trip.departure)} {formatTime(trip.departure)}
                      </span>
                      <span>{bookedCount}/{seatCount} {isRTL ? 'محجوز' : 'booked'}</span>
                      <span>{boardedCount} {isRTL ? 'صعد' : 'boarded'}</span>
                    </div>
                  </div>

                  {/* Occupancy bar */}
                  <div className="hidden sm:flex flex-col items-end gap-1.5 w-32 shrink-0">
                    <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${occupancy}%` }}
                        transition={{ duration: 0.5 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: occupancy === 100 ? '#10b981' : '#3b82f6' }}
                      />
                    </div>
                    <span className="text-xs text-zinc-500">{occupancy}%</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/admin/trips/${trip.id}/seats`}
                      onClick={e => e.stopPropagation()}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition flex items-center gap-1.5"
                    >
                      <Armchair size={12} />
                      {isRTL ? 'خريطة المقاعد' : 'Seat Map'}
                    </Link>
                    <Link
                      href={`/admin/trips/${trip.id}/passengers`}
                      onClick={e => e.stopPropagation()}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition flex items-center gap-1.5"
                    >
                      {isRTL ? 'الركاب' : 'Passengers'}
                    </Link>
                    <span className={cn('text-zinc-500 transition-transform', isOpen && 'rotate-180')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </div>
                </button>

                {/* Expanded seat overview */}
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-white/5 px-5 py-4"
                  >
                    {bookings.filter(b => b.status !== 'CANCELLED').length === 0 ? (
                      <p className="text-center text-zinc-600 text-sm py-4">
                        {isRTL ? 'مفيش حجزات في الرحلة دي' : 'No bookings for this trip yet'}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {bookings.filter(b => b.status !== 'CANCELLED').map(b => (
                          <div key={b.id} className={cn(
                            'flex items-center gap-4 p-3 rounded-xl border',
                            b.boarded ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/[0.02]'
                          )}>
                            <div className={cn(
                              'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold font-mono shrink-0',
                              b.boarded ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/15 text-blue-400'
                            )}>
                              {b.seatLabel}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white">
                                {b.passengerName || b.user?.name}
                              </p>
                              <p className="text-xs text-zinc-500 truncate">{b.user?.email}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-mono text-blue-400">{b.reference}</p>
                              <p className="text-xs text-zinc-500">{b.total?.toLocaleString()} {isRTL ? 'ج.م' : 'EGP'}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {b.boarded ? (
                                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <CheckCircle2 size={10} />
                                  {isRTL ? 'صعد' : 'Boarded'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  {isRTL ? 'منتظر' : 'Waiting'}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}