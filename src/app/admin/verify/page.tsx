'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanEye, Search, CheckCircle2, XCircle, Clock, QrCode, Users as UsersIcon } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface BookingResult {
  id: string
  reference: string
  seatLabel: string
  status: string
  boarded: boolean
  paidAt: string | null
  boardedAt: string | null
  total: number
  user: { name: string; email: string }
  trip: {
    id: string
    origin: string
    destination: string
    departure: string
    arrival: string
    bus: { name: string; type: string }
  }
}

export default function VerifyPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [query, setQuery] = useState('')
  const [booking, setBooking] = useState<BookingResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [boarding, setBoarding] = useState(false)
  const [success, setSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setBooking(null)
    setSuccess(false)

    try {
      // Try by booking ID first, then by reference
      let res = await fetch(`/api/bookings/${query.trim()}`, { credentials: 'include' })
      if (!res.ok) {
        // Try search by reference
        const listRes = await fetch(`/api/bookings?search=${encodeURIComponent(query.trim())}`, { credentials: 'include' })
        if (listRes.ok) {
          const data = await listRes.json()
          if (data.data?.[0]) {
            res = await fetch(`/api/bookings/${data.data[0].id}`, { credentials: 'include' })
          }
        }
      }

      if (res.ok) {
        const data = await res.json()
        if (data.status === 'CANCELLED') {
          setError(lang === 'ar' ? 'هذه الحجز ملغي' : 'This booking is cancelled')
        } else if (data.status === 'BOARDED') {
          setError(lang === 'ar' ? 'المسافر بالفعل صعد الباص' : 'Passenger already boarded')
        } else {
          setBooking(data)
        }
      } else if (res.status === 404) {
        setError(lang === 'ar' ? 'لم يتم العثور على الحجز' : 'Booking not found')
      } else {
        setError(lang === 'ar' ? 'خطأ في البحث' : 'Search error')
      }
    } catch {
      setError(lang === 'ar' ? 'خطأ في الاتصال' : 'Connection error')
    } finally {
      setLoading(false)
    }
  }

  async function handleBoard() {
    if (!booking) return
    setBoarding(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'BOARDED' }),
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setBooking(prev => prev ? { ...prev, ...data, boarded: true, status: 'BOARDED' } : null)
        setSuccess(true)
      } else {
        setError(lang === 'ar' ? 'فشل في تأكيد الصعود' : 'Failed to confirm boarding')
      }
    } catch {
      setError(lang === 'ar' ? 'خطأ في الاتصال' : 'Connection error')
    } finally {
      setBoarding(false)
    }
  }

  return (
    <div className={cn('max-w-2xl mx-auto', isRTL && 'font-[Cairo]')}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <ScanEye className="text-blue-400" size={20} />
          </div>
          <h1 className="text-2xl font-display font-bold text-white">
            {lang === 'ar' ? 'تحقق من الصعود' : 'Boarding Verification'}
          </h1>
        </div>
        <p className="text-zinc-400 text-sm">
          {lang === 'ar'
            ? 'ابحث عن الحجز بالرقم المرجعي أو رقم الهاتف للتحقق من صعود المسافر'
            : 'Search by booking reference or phone to verify passenger boarding'}
        </p>
      </motion.div>

      {/* Search */}
      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleSearch}
        className="flex gap-3 mb-8"
      >
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === 'ar' ? 'رقم الحجز أو الكود المرجعي...' : 'Booking ID or reference code...'}
            className={cn(
              'w-full bg-zinc-900 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-zinc-500',
              'focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm'
            )}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className={cn(
            'px-6 py-3 rounded-xl font-semibold text-sm transition-all',
            'bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed',
            'hover-lift flex items-center gap-2'
          )}
        >
          <ScanEye size={16} />
          {loading ? (lang === 'ar' ? 'جارٍ البحث...' : 'Searching...') : (lang === 'ar' ? 'ابحث' : 'Search')}
        </button>
      </motion.form>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mb-6"
          >
            <XCircle size={20} />
            <span className="text-sm">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success toast */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 shadow-2xl shadow-emerald-500/10"
          >
            <CheckCircle2 size={20} />
            <span className="text-sm font-semibold">
              {lang === 'ar' ? 'تم تأكيد صعود المسافر بنجاح!' : 'Boarding confirmed successfully!'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Booking card */}
      <AnimatePresence>
        {booking && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl glass border border-white/10 overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm',
                    booking.status === 'BOARDED' ? 'bg-emerald-500' : 'bg-blue-500'
                  )}>
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">
                      {lang === 'ar' ? 'رقم الحجز' : 'Booking Reference'}
                    </p>
                    <p className="text-lg font-mono font-bold text-white">{booking.reference}</p>
                  </div>
                </div>
                <span className={cn(
                  'px-3 py-1 rounded-full text-xs font-semibold',
                  booking.boarded
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                )}>
                  {booking.boarded ? (lang === 'ar' ? 'صعد' : 'Boarded') : (lang === 'ar' ? 'بانتظار الصعود' : 'Waiting')}
                </span>
              </div>
            </div>

            {/* Details */}
            <div className="p-6 space-y-4">
              {/* Passenger */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <UsersIcon size={16} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">{lang === 'ar' ? 'المسافر' : 'Passenger'}</p>
                  <p className="text-sm font-semibold text-white">{booking.user.name}</p>
                  <p className="text-xs text-zinc-500">{booking.user.email}</p>
                </div>
              </div>

              {/* Trip info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">{lang === 'ar' ? 'المسار' : 'Route'}</p>
                  <p className="text-sm font-semibold text-white">
                    {booking.trip.origin} → {booking.trip.destination}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">{lang === 'ar' ? 'المقعد' : 'Seat'}</p>
                  <p className="text-sm font-bold text-blue-400">{booking.seatLabel}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">{lang === 'ar' ? 'الباص' : 'Bus'}</p>
                  <p className="text-sm text-white">{booking.trip.bus.name}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">{lang === 'ar' ? 'المبلغ' : 'Total'}</p>
                  <p className="text-sm font-bold text-emerald-400">
                    {lang === 'ar' ? 'ج.م' : 'EGP'} {booking.total?.toFixed?.(2) ?? booking.total}
                  </p>
                </div>
              </div>

              {/* Time */}
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Clock size={14} />
                <span>
                  {lang === 'ar' ? 'المغادرة:' : 'Departure:'} {new Date(booking.trip.departure).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                </span>
              </div>

              {booking.boarded && booking.boardedAt && (
                <div className="flex items-center gap-2 text-xs text-emerald-500">
                  <CheckCircle2 size={14} />
                  <span>
                    {lang === 'ar' ? 'صعد في:' : 'Boarded at:'} {new Date(booking.boardedAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                  </span>
                </div>
              )}
            </div>

            {/* Action */}
            {!booking.boarded && (
              <div className="p-6 border-t border-white/5">
                <button
                  onClick={handleBoard}
                  disabled={boarding}
                  className={cn(
                    'w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
                    'bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed',
                    'hover-lift'
                  )}
                >
                  {boarding ? (
                    <span>{lang === 'ar' ? 'جارٍ التاكيد...' : 'Confirming...'}</span>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      {lang === 'ar' ? 'تاكيد صعود المسافر' : 'Confirm Boarding'}
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instructions */}
      {!booking && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center py-12 text-zinc-600"
        >
          <QrCode size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">
            {lang === 'ar'
              ? 'ادخل رقم الحجز او الكود المرجعي ثم اضغط ابحث'
              : 'Enter booking ID or reference code, then press Search'}
          </p>
        </motion.div>
      )}
    </div>
  )
}