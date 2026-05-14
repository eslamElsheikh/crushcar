'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, CheckCircle2, Clock, User, Phone, Bus, MapPin, Loader2, XCircle, Search, RefreshCw } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface Passenger {
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
  bus: { id: string; name: string; type: string; seatCount: number }
  bookings: Passenger[]
}

export default function TripPassengersPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.id as string
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [boardingId, setBoardingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'boarded' | 'pending'>('all')

  useEffect(() => {
    loadTrip()
  }, [tripId])

  async function loadTrip() {
    setLoading(true)
    try {
      const res = await fetch(`/api/trips/${tripId}`, { credentials: 'include' })
      if (res.ok) setTrip(await res.json())
    } catch {}
    setLoading(false)
  }

  async function markBoarded(bookingId: string) {
    setBoardingId(bookingId)
    try {
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
      }
    } finally {
      setBoardingId(null)
    }
  }

  const allPassengers = trip?.bookings.filter(b => b.status !== 'CANCELLED') || []
  const boarded = allPassengers.filter(b => b.boarded)
  const pending = allPassengers.filter(b => !b.boarded && b.status === 'PAID')
  const cancelled = allPassengers.filter(b => b.status === 'CANCELLED')

  const filtered = filter === 'all'
    ? allPassengers
    : filter === 'boarded'
    ? boarded
    : pending

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!trip) return null

  const totalSeats = trip.bus.seatCount
  const boardingRate = allPassengers.length > 0
    ? Math.round((boarded.length / allPassengers.length) * 100)
    : 0

  return (
    <div className={cn('max-w-5xl mx-auto', isRTL && 'font-[Cairo]')}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push('/admin/trips')}
          className="p-2.5 rounded-xl glass hover:bg-zinc-800/50 border border-white/5 transition"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Bus size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-white">
              {trip.origin} → {trip.destination}
            </h1>
            <p className="text-zinc-400 text-sm">
              {new Date(trip.departure).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {' · '}
              {new Date(trip.departure).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <button
          onClick={loadTrip}
          className="p-2 rounded-xl glass hover:bg-zinc-800/50 border border-white/5 transition text-zinc-400 hover:text-white"
        >
          <RefreshCw size={18} />
        </button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          {
            label: lang === 'ar' ? 'إجمالي الحجوزات' : 'Total Bookings',
            value: allPassengers.length,
            sub: `${lang === 'ar' ? 'من' : 'of'} ${totalSeats} ${lang === 'ar' ? 'مقعد' : 'seats'}`,
            color: '#3b82f6',
            icon: User,
          },
          {
            label: lang === 'ar' ? 'صعدوا' : 'Boarded',
            value: boarded.length,
            sub: `${boardingRate}% ${lang === 'ar' ? 'نسبة الصعود' : 'boarding rate'}`,
            color: '#10b981',
            icon: CheckCircle2,
          },
          {
            label: lang === 'ar' ? 'بانتظار الصعود' : 'Waiting',
            value: pending.length,
            sub: lang === 'ar' ? 'لم يصعد بعد' : 'not boarded yet',
            color: '#f59e0b',
            icon: Clock,
          },
          {
            label: lang === 'ar' ? 'ملغية' : 'Cancelled',
            value: cancelled.length,
            sub: '',
            color: '#f43f5e',
            icon: XCircle,
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded-2xl glass border border-white/10 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={16} style={{ color: stat.color }} />
              <span className="text-xs text-zinc-400">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            {stat.sub && <p className="text-xs text-zinc-500 mt-0.5">{stat.sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* Boarding progress bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="rounded-2xl glass border border-white/10 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-400">{lang === 'ar' ? 'نسبة الصعود' : 'Boarding Progress'}</span>
          <span className="text-xs font-bold text-white">{boardingRate}%</span>
        </div>
        <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${boardingRate}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ backgroundColor: boardingRate === 100 ? '#10b981' : '#3b82f6' }}
          />
        </div>
      </motion.div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'pending', 'boarded'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all',
              filter === f
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            )}>
            {f === 'all' ? (lang === 'ar' ? 'الكل' : 'All') :
             f === 'boarded' ? (lang === 'ar' ? 'صعدوا' : 'Boarded') :
             (lang === 'ar' ? 'بانتظار' : 'Waiting')} ({f === 'all' ? allPassengers.length : f === 'boarded' ? boarded.length : pending.length})
          </button>
        ))}
      </div>

      {/* Passenger list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <User size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {filter === 'pending'
              ? (lang === 'ar' ? 'مفيش حد منتظر الصعود' : 'No passengers waiting')
              : (lang === 'ar' ? 'مفيش ركاب في الرحلة دي' : 'No passengers in this trip')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn(
                'rounded-2xl glass border p-4 transition-all',
                p.boarded
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : 'border-white/10'
              )}
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0',
                  p.boarded ? 'bg-emerald-500' : 'bg-blue-500'
                )}>
                  {p.user.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white text-sm">{p.user.name}</p>
                    {p.passengerName && (
                      <span className="text-xs text-amber-400/70 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                        {p.passengerName}
                      </span>
                    )}
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-semibold',
                      p.boarded
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    )}>
                      {p.boarded ? (lang === 'ar' ? 'صعد' : 'Boarded') : (lang === 'ar' ? 'منتظر' : 'Waiting')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Phone size={10} />
                      {p.user.email}
                    </span>
                    <span className="font-mono text-blue-400 font-semibold">{p.reference}</span>
                  </div>
                </div>

                {/* Seat + Price */}
                <div className="text-center shrink-0">
                  <p className="text-lg font-bold text-white">{p.seatLabel}</p>
                  <p className="text-xs text-zinc-500">{lang === 'ar' ? 'مقعد' : 'Seat'}</p>
                </div>
                <div className="text-center shrink-0">
                  <p className="text-sm font-bold text-emerald-400">
                    {lang === 'ar' ? 'ج.م' : 'EGP'} {p.total?.toFixed?.(0) ?? p.total}
                  </p>
                  <p className="text-xs text-zinc-500">{lang === 'ar' ? 'السعر' : 'Price'}</p>
                </div>

                {/* Action */}
                {!p.boarded && (
                  <button
                    onClick={() => markBoarded(p.id)}
                    disabled={boardingId === p.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shrink-0 disabled:opacity-50 hover-lift"
                  >
                    {boardingId === p.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    {lang === 'ar' ? 'تأكيد الصعود' : 'Board'}
                  </button>
                )}
                {p.boarded && p.boardedAt && (
                  <div className="text-right shrink-0">
                    <p className="text-xs text-emerald-500">
                      {lang === 'ar' ? 'صعد في' : 'Boarded at'}
                    </p>
                    <p className="text-xs text-emerald-400 font-mono">
                      {new Date(p.boardedAt).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}