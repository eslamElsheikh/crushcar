'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { CheckCircle2, MapPin, Bus, Clock, Loader2, Home } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

function SuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const ref = searchParams.get('ref')
  const sessionId = searchParams.get('session_id')
  const [booking, setBooking] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function verifyAndLoad() {
      // Try payment verification first
      if (sessionId) {
        try {
          const verifyRes = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
            credentials: 'include',
          })
          const verifyData = await verifyRes.json()
          if (verifyData.booking) {
            setBooking(verifyData.booking)
            setLoading(false)
            return
          }
        } catch {}
      }

      // Fallback: load booking by ref directly
      if (ref) {
        fetch(`/api/bookings?ref=${encodeURIComponent(ref)}`, { credentials: 'include' })
          .then(r => r.json())
          .then(data => {
            if (data.data?.[0]) setBooking(data.data[0])
            else if (data[0]) setBooking(data[0])
          })
          .catch(console.error)
          .finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    }

    verifyAndLoad()
  }, [ref, sessionId])

  return (
    <div className={cn('min-h-screen flex items-center justify-center px-4 py-16', isRTL && 'font-[Cairo]')}>
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 100 }}
        className="text-center max-w-md relative z-10"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/30"
        >
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-pulse" />
          <CheckCircle2 size={40} className="text-white relative z-10" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className={cn('text-3xl font-display font-bold mb-3 text-white', isRTL && 'font-[Cairo]')}
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

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : booking ? (
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
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">{isRTL ? 'رقم الحجز' : 'Reference'}</span>
                <span className="font-mono font-bold text-blue-400">{booking.reference}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">{isRTL ? 'المسار' : 'Route'}</span>
                <div className="flex items-center gap-2 text-white">
                  <MapPin size={14} className="text-blue-400" />
                  {booking.trip?.origin} <span className="text-zinc-600 mx-1">→</span> {booking.trip?.destination}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">{isRTL ? 'المقعد' : 'Seat'}</span>
                <span className="font-bold text-white text-lg">{booking.seatLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">{isRTL ? 'المبلغ' : 'Total'}</span>
                <span className="font-bold text-emerald-400">{booking.total?.toFixed?.(0)} {isRTL ? 'ج.م' : 'EGP'}</span>
              </div>
              {booking.trip?.bus?.name && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">{isRTL ? 'الباص' : 'Bus'}</span>
                  <div className="flex items-center gap-2 text-white">
                    <Bus size={14} className="text-purple-400" />
                    {booking.trip.bus.name}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-white/5 flex gap-3">
              <Link href={`/bookings/${booking.id}`} className="flex-1 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold text-center hover:bg-emerald-500/20 transition">
                {isRTL ? 'عرض الحجز' : 'View Booking'}
              </Link>
              <Link href={`/bookings/${booking.id}/print`} className="flex-1 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-semibold text-center hover:bg-blue-500/20 transition">
                {isRTL ? 'اطبع التذكرة' : 'Print Ticket'}
              </Link>
            </div>
          </motion.div>
        ) : ref ? (
          <div className="glass rounded-3xl p-8 mb-8 border border-white/10">
            <p className="text-zinc-400 text-sm mb-2">{isRTL ? 'رقم الحجز' : 'Reference'}</p>
            <p className="text-2xl font-mono font-bold text-blue-400">{ref}</p>
            <p className="text-zinc-500 text-xs mt-4">
              {isRTL ? 'تم الدفع بنجاح — ستصل رسالة تأكيد على الإيميل' : 'Payment confirmed — check your email for confirmation'}
            </p>
          </div>
        ) : null}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
          <Link href="/trips" className="flex items-center justify-center gap-2 text-sm text-zinc-500 hover:text-white transition">
            <Home size={14} />
            {isRTL ? 'الرئيسية' : 'Back to Home'}
          </Link>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default function BookingSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 size={32} className="animate-spin text-blue-400" /></div>}>
      <SuccessContent />
    </Suspense>
  )
}