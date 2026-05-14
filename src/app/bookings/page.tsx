'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useSession, signOut } from 'next-auth/react'
import { Ticket, Bus, MapPin, Clock, CheckCircle, XCircle, AlertCircle, Calendar, Copy, LogOut, X, Printer } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface Booking {
  id: string
  reference: string
  seatLabel: string
  passengerName: string
  status: string
  total: number
  paidAt: string | null
  createdAt: string
  boarded: boolean
  boardedAt: string | null
  trip: {
    id: string
    origin: string
    destination: string
    departure: string
    arrival: string
    status: string
    bus: { id: string; name: string }
  }
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: { ar: string; en: string } }> = {
  PAID: {
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: <CheckCircle size={12} />,
    label: { ar: 'مؤكد', en: 'CONFIRMED' },
  },
  PENDING: {
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    icon: <AlertCircle size={12} />,
    label: { ar: 'معلق', en: 'PENDING' },
  },
  CANCELLED: {
    color: 'bg-red-500/10 text-red-400 border-red-500/20',
    icon: <XCircle size={12} />,
    label: { ar: 'ملغي', en: 'CANCELLED' },
  },
  BOARDED: {
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    icon: <CheckCircle size={12} />,
    label: { ar: 'صعد', en: 'BOARDED' },
  },
}

export default function MyBookingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [cancelModal, setCancelModal] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (!session) return
    loadBookings()
  }, [session])

  async function loadBookings() {
    try {
      const res = await fetch('/api/bookings', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setBookings(Array.isArray(data) ? data : (data.data || []))
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel(bookingId: string) {
    setCancelModal(bookingId)
  }

  async function confirmCancel() {
    if (!cancelModal) return
    const bookingId = cancelModal
    setCancelModal(null)
    setCancelling(bookingId)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      if (res.ok) {
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'CANCELLED' } : b))
      }
    } catch {
    } finally {
      setCancelling(null)
    }
  }

  function copyRef(ref: string) {
    navigator.clipboard.writeText(ref)
    setCopied(ref)
    setTimeout(() => setCopied(null), 2000)
  }

  const paidBookings = bookings.filter(b => b.status === 'PAID')
  const cancelledBookings = bookings.filter(b => b.status === 'CANCELLED')
  const upcomingBookings = paidBookings.filter(b => new Date(b.trip.departure) > new Date())
  const pastBookings = paidBookings.filter(b => new Date(b.trip.departure) <= new Date())

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={cn('min-h-screen bg-background', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="glass border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">CC</span>
            </div>
            <span className="font-display font-bold text-white">CrushCar</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/trips" className="text-sm text-zinc-400 hover:text-white transition">
              {isRTL ? 'الرحلات' : 'Trips'}
            </Link>
            <Link href="/profile" className="text-sm text-zinc-400 hover:text-white transition">
              {isRTL ? 'حسابي' : 'Account'}
            </Link>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-red-400 transition">
              <LogOut size={14} />
              {isRTL ? 'خروج' : 'Sign Out'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* User info */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold mb-1">
              {isRTL ? 'حجوزاتي' : 'My Bookings'}
            </h1>
            <p className="text-zinc-400 text-sm">
              {session?.user?.name || session?.user?.email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center px-4 py-2 glass rounded-xl border border-zinc-800">
              <p className="text-xl font-bold text-blue-400">{upcomingBookings.length}</p>
              <p className="text-xs text-zinc-500">{isRTL ? 'رحلة قادمة' : 'Upcoming'}</p>
            </div>
            <div className="text-center px-4 py-2 glass rounded-xl border border-zinc-800">
              <p className="text-xl font-bold text-emerald-400">{paidBookings.length}</p>
              <p className="text-xs text-zinc-500">{isRTL ? 'إجمالي' : 'Total'}</p>
            </div>
          </div>
        </div>

        {bookings.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 glass rounded-2xl border border-zinc-800">
            <Ticket size={48} className="mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {isRTL ? 'مفيش حجز لحد كده' : 'No bookings yet'}
            </h3>
            <p className="text-zinc-500 text-sm mb-6">
              {isRTL ? 'احجز رحلتك الأولي دلوقتي' : 'Book your first trip today'}
            </p>
            <Link href="/trips" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm transition">
              {isRTL ? 'تصفح الرحلات' : 'Browse Trips'}
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {/* Upcoming */}
            {upcomingBookings.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Calendar size={14} />
                  {isRTL ? 'رحلات قادمة' : 'Upcoming Trips'} ({upcomingBookings.length})
                </h2>
                <div className="space-y-4">
                  {upcomingBookings.map((booking, i) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      index={i}
                      isRTL={isRTL}
                      lang={lang}
                      cancelling={cancelling}
                      onCancel={handleCancel}
                      onCopy={copyRef}
                      copied={copied}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Past */}
            {pastBookings.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Clock size={14} />
                  {isRTL ? 'رحلات سابقة' : 'Past Trips'} ({pastBookings.length})
                </h2>
                <div className="space-y-4">
                  {pastBookings.map((booking, i) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      index={i}
                      isRTL={isRTL}
                      lang={lang}
                      cancelling={cancelling}
                      onCancel={handleCancel}
                      onCopy={copyRef}
                      copied={copied}
                      muted
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Cancelled */}
            {cancelledBookings.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-zinc-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <XCircle size={14} />
                  {isRTL ? 'ملغية' : 'Cancelled'} ({cancelledBookings.length})
                </h2>
                <div className="space-y-4">
                  {cancelledBookings.map((booking, i) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      index={i}
                      isRTL={isRTL}
                      lang={lang}
                      cancelling={cancelling}
                      onCancel={handleCancel}
                      onCopy={copyRef}
                      copied={copied}
                      muted
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cancel confirmation modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setCancelModal(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative glass rounded-2xl p-8 max-w-sm w-full border border-zinc-700 shadow-2xl"
          >
            <button
              onClick={() => setCancelModal(null)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
            >
              <X size={16} />
            </button>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <h3 className={cn('text-lg font-bold text-white mb-2', isRTL && 'font-[Cairo]')}>
                {isRTL ? 'إلغاء الحجز' : 'Cancel Booking'}
              </h3>
              <p className={cn('text-sm text-zinc-400', isRTL && 'font-[Cairo]')}>
                {isRTL ? 'هل أنت متأكد من إلغاء هذا الحجز؟ لا يمكن التراجع.' : 'Are you sure? This action cannot be undone.'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelModal(null)}
                className="flex-1 py-2.5 rounded-xl glass border border-zinc-700 text-zinc-400 hover:text-white hover:bg-white/5 transition text-sm font-medium"
              >
                {isRTL ? 'لا، احتفظ به' : 'Keep it'}
              </button>
              <button
                onClick={confirmCancel}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition"
              >
                {isRTL ? 'نعم، إلغاء' : 'Yes, cancel'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function BookingCard({ booking, index, isRTL, lang, cancelling, onCancel, onCopy, copied, muted }: {
  booking: Booking
  index: number
  isRTL: boolean
  lang: 'ar' | 'en'
  cancelling: string | null
  onCancel: (id: string) => void
  onCopy: (ref: string) => void
  copied: string | null
  muted?: boolean
}) {
  const status = statusConfig[booking.status] || statusConfig.PENDING
  const isUpcoming = booking.status === 'PAID' && new Date(booking.trip.departure) > new Date()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        'glass rounded-2xl p-6 border transition-all duration-300',
        muted
          ? 'border-zinc-800/50 opacity-60'
          : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/20'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left - booking details */}
        <div className="flex-1 min-w-0">
          {/* Reference Code */}
          <div className="flex items-center gap-2 mb-4">
            <span className="font-mono text-sm font-bold text-blue-400 bg-blue-500/5 px-3 py-1.5 rounded-lg border border-blue-500/10">
              {booking.reference}
            </span>
            <button
              onClick={() => onCopy(booking.reference)}
              className="p-1.5 rounded-lg hover:bg-zinc-700/50 transition text-zinc-500 hover:text-white"
              title={isRTL ? 'نسخ' : 'Copy'}
            >
              <Copy size={14} />
            </button>
            {copied === booking.reference && (
              <span className="text-xs text-emerald-400">{isRTL ? 'تم!' : 'Copied!'}</span>
            )}
          </div>

          {/* Route */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="text-blue-400" />
              <span className="font-semibold text-white">{booking.trip.origin}</span>
            </div>
            <span className="text-zinc-600">→</span>
            <span className="font-semibold text-white">{booking.trip.destination}</span>
          </div>

          {/* Details */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Bus size={13} />
              {booking.trip.bus.name}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar size={13} />
              {formatDate(booking.trip.departure)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={13} />
              {formatTime(booking.trip.departure)}
            </span>
            <span className="font-mono text-white bg-zinc-800 px-2 py-0.5 rounded text-xs font-bold">
              {booking.seatLabel}
            </span>
            {booking.passengerName && (
              <span className="flex items-center gap-1.5 text-amber-400/70">
                <span className="text-xs">👤</span>
                {booking.passengerName}
              </span>
            )}
          </div>
        </div>

        {/* Right - status & price */}
        <div className="flex flex-col items-end gap-3 flex-shrink-0">
          <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border', status.color)}>
            {status.icon}
            {status.label[lang as 'ar' | 'en']}
          </span>
          <div className="text-left">
            <p className="text-xl font-display font-bold text-white">
              {Math.round(booking.total).toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500">{isRTL ? 'ج.م' : 'EGP'}</p>
          </div>
          {isUpcoming && (
            <button
              onClick={() => onCancel(booking.id)}
              disabled={cancelling === booking.id}
              className="text-xs px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
            >
              {cancelling === booking.id ? (isRTL ? 'جارِ...' : 'Cancelling...') : (isRTL ? 'إلغاء الحجز' : 'Cancel Booking')}
            </button>
          )}
          <Link
            href={`/bookings/${booking.id}/print`}
            className="text-xs px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition flex items-center gap-1.5"
          >
            <Printer size={12} />
            {isRTL ? 'اطبع التذكرة' : 'Print Ticket'}
          </Link>
        </div>
      </div>
    </motion.div>
  )
}