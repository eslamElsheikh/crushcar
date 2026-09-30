'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Bus, MapPin, Clock, Calendar, User, Phone,
  Mail, QrCode, CheckCircle, XCircle, Loader2, Printer,
  CreditCard, Hash, Armchair
} from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface BookingData {
  id: string
  reference: string
  seatLabel: string
  status: string
  total: number
  paidAt: string | null
  createdAt: string
  passengerName?: string
  actualOrigin?: string
  actualDestination?: string
  actualDeparture?: string
  fromStopOrder?: number
  toStopOrder?: number
  cancelledAt?: string | null
  cancellationReason?: string | null
  refundAmount?: number | null
  cancellationFee?: number | null
  refundProcessedAt?: string | null
  refundProcessedBy?: string | null
  user: { name: string; email: string; phone: string }
  trip: {
    id: string
    origin: string
    destination: string
    departure: string
    arrival: string
    status: string
    bus: {
      name: string
      type: string
      company: { name: string }
    }
  }
  tripStops?: Array<{
    id: string
    stationId: string
    stopOrder: number
    priceFromOrigin: number
    station?: { name: string }
  }>
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

export default function BookingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const bookingId = params.id as string
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const t = useLangStore((s) => s.t)
  const [booking, setBooking] = useState<BookingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [qrCode, setQrCode] = useState<string>('')

  useEffect(() => {
    loadBooking()
  }, [bookingId])

  async function loadBooking() {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/ticket`)
      if (res.ok) {
        const data = await res.json()
        setBooking(data)
        setQrCode(data.qrCode || '')
      } else {
        router.push('/bookings')
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-400" />
      </div>
    )
  }

  if (!booking) return null

  const isPaid = booking.status === 'PAID'
  const isCancelled = booking.status === 'CANCELLED'

  return (
    <div className={cn('min-h-screen px-4 py-8', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="max-w-3xl mx-auto mb-6 flex items-center gap-4">
        <button
          onClick={() => router.push('/bookings')}
          className="p-2.5 rounded-xl bg-zinc-800/50 hover:bg-zinc-700/50 text-white transition"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">
            {isRTL ? 'تفاصيل الحجز' : 'Booking Details'}
          </h1>
          <p className="text-sm text-zinc-400">{booking.reference}</p>
        </div>
        <Link
          href={`/bookings/${booking.id}/print`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-semibold hover:bg-blue-500/20 transition"
        >
          <Printer size={16} />
          {isRTL ? 'اطبع' : 'Print'}
        </Link>
      </div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto space-y-6"
      >
        {/* Status Card */}
        <div className={cn(
          'glass rounded-2xl p-6 border',
          isPaid ? 'border-emerald-500/20' : isCancelled ? 'border-red-500/20' : 'border-yellow-500/20'
        )}>
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center',
              isPaid ? 'bg-emerald-500/20' : isCancelled ? 'bg-red-500/20' : 'bg-yellow-500/20'
            )}>
              {isPaid ? (
                <CheckCircle size={28} className="text-emerald-400" />
              ) : isCancelled ? (
                <XCircle size={28} className="text-red-400" />
              ) : (
                <Clock size={28} className="text-yellow-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {t(`booking.${booking.status.toLowerCase()}`) || booking.status}
              </h2>
              <p className="text-sm text-zinc-400">
                {isRTL ? 'رقم الحجز' : 'Reference'}: <span className="font-mono text-blue-400">{booking.reference}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Route Card */}
        <div className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            {isRTL ? 'معلومات الرحلة' : 'Trip Information'}
          </h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <MapPin size={20} className="text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-zinc-500">{isRTL ? 'من' : 'From'}</p>
                <p className="text-lg font-bold text-white">{booking.actualOrigin || booking.trip.origin}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <MapPin size={20} className="text-purple-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-zinc-500">{isRTL ? 'إلى' : 'To'}</p>
                <p className="text-lg font-bold text-white">{booking.actualDestination || booking.trip.destination}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-zinc-500" />
                <div>
                  <p className="text-xs text-zinc-500">{isRTL ? 'التاريخ' : 'Date'}</p>
                  <p className="text-sm font-semibold text-white">{formatDate(booking.actualDeparture || booking.trip.departure)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock size={16} className="text-zinc-500" />
                <div>
                  <p className="text-xs text-zinc-500">{isRTL ? 'الموعد' : 'Time'}</p>
                  <p className="text-sm font-semibold text-white">{formatTime(booking.actualDeparture || booking.trip.departure)}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Bus size={16} className="text-zinc-500" />
              <div>
                <p className="text-xs text-zinc-500">{isRTL ? 'الباص' : 'Bus'}</p>
                <p className="text-sm font-semibold text-white">{booking.trip.bus.name} - {booking.trip.bus.company.name}</p>
              </div>
            </div>

            {/* Route path (stops) */}
            {booking.tripStops && booking.tripStops.length > 0 && booking.fromStopOrder && booking.toStopOrder && (
              <div className="pt-4 border-t border-white/10">
                <p className="text-xs text-zinc-500 mb-3">{isRTL ? 'المسار' : 'Route Path'}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const relevantStops = booking.tripStops!
                      .filter((s: any) => s.stopOrder >= booking.fromStopOrder! && s.stopOrder <= booking.toStopOrder!)
                      .sort((a: any, b: any) => a.stopOrder - b.stopOrder)
                    return relevantStops.map((stop: any, idx: number) => (
                      <span key={stop.id} className="flex items-center gap-2">
                        <span className={cn(
                          'text-sm font-semibold',
                          idx === 0 ? 'text-blue-400' : idx === relevantStops.length - 1 ? 'text-emerald-400' : 'text-zinc-300'
                        )}>
                          {stop.station?.name}
                        </span>
                        {idx < relevantStops.length - 1 && (
                          <span className="text-zinc-600">{isRTL ? '←' : '→'}</span>
                        )}
                      </span>
                    ))
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Booking Details Card */}
        <div className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            {isRTL ? 'تفاصيل الحجز' : 'Booking Details'}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Armchair size={16} className="text-zinc-500" />
              <div>
                <p className="text-xs text-zinc-500">{isRTL ? 'المقعد' : 'Seat'}</p>
                <p className="text-lg font-bold text-white">{booking.seatLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CreditCard size={16} className="text-zinc-500" />
              <div>
                <p className="text-xs text-zinc-500">{isRTL ? 'المبلغ' : 'Total'}</p>
                <p className="text-lg font-bold text-emerald-400">{Math.round(booking.total)} EGP</p>
              </div>
            </div>
            {booking.paidAt && (
              <div className="flex items-center gap-3 col-span-2">
                <CheckCircle size={16} className="text-emerald-500" />
                <div>
                  <p className="text-xs text-zinc-500">{isRTL ? 'تاريخ الدفع' : 'Paid At'}</p>
                  <p className="text-sm font-semibold text-white">{formatDate(booking.paidAt)} - {formatTime(booking.paidAt)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Passenger Card */}
        <div className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            {isRTL ? 'معلومات المسافر' : 'Passenger Information'}
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <User size={16} className="text-zinc-500" />
              <div>
                <p className="text-xs text-zinc-500">{isRTL ? 'الاسم' : 'Name'}</p>
                <p className="text-sm font-semibold text-white">{booking.passengerName || booking.user.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail size={16} className="text-zinc-500" />
              <div>
                <p className="text-xs text-zinc-500">{isRTL ? 'البريد' : 'Email'}</p>
                <p className="text-sm font-semibold text-white">{booking.user.email}</p>
              </div>
            </div>
            {booking.user.phone && (
              <div className="flex items-center gap-3">
                <Phone size={16} className="text-zinc-500" />
                <div>
                  <p className="text-xs text-zinc-500">{isRTL ? 'الموبايل' : 'Phone'}</p>
                  <p className="text-sm font-semibold text-white">{booking.user.phone}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cancellation Info */}
        {isCancelled && (booking.cancelledAt || booking.refundAmount !== undefined) && (
          <div className="glass rounded-2xl p-6 border border-red-500/20">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              {t('cancel.policy')}
            </h3>
            <div className="space-y-3">
              {booking.cancelledAt && (
                <div className="flex items-center gap-3">
                  <Clock size={16} className="text-zinc-500" />
                  <div>
                    <p className="text-xs text-zinc-500">{t('cancel.cancelledAt')}</p>
                    <p className="text-sm font-semibold text-white">{formatDate(booking.cancelledAt)}</p>
                  </div>
                </div>
              )}
              {booking.cancellationReason && (
                <div className="flex items-center gap-3">
                  <XCircle size={16} className="text-zinc-500" />
                  <div>
                    <p className="text-xs text-zinc-500">{t('cancel.reasonLabel')}</p>
                    <p className="text-sm font-semibold text-white">{booking.cancellationReason}</p>
                  </div>
                </div>
              )}
              {booking.refundAmount !== undefined && booking.refundAmount !== null && (
                <div className="flex items-center gap-3">
                  <CreditCard size={16} className="text-emerald-500" />
                  <div>
                    <p className="text-xs text-zinc-500">{t('cancel.refundedAmount')}</p>
                    <p className="text-sm font-semibold text-emerald-400">{Math.round(booking.refundAmount)} EGP</p>
                  </div>
                </div>
              )}
              {booking.cancellationFee !== undefined && booking.cancellationFee !== null && booking.cancellationFee > 0 && (
                <div className="flex items-center gap-3">
                  <CreditCard size={16} className="text-red-500" />
                  <div>
                    <p className="text-xs text-zinc-500">{t('cancel.fee')}</p>
                    <p className="text-sm font-semibold text-red-400">{Math.round(booking.cancellationFee)} EGP</p>
                  </div>
                </div>
              )}
              {booking.refundAmount !== undefined && booking.refundAmount !== null && booking.refundAmount > 0 && (
                <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                  {booking.refundProcessedAt ? (
                    <>
                      <CheckCircle size={16} className="text-emerald-500" />
                      <div>
                        <p className="text-xs text-zinc-500">{t('cancel.refundProcessed')}</p>
                        <p className="text-sm font-semibold text-emerald-400">{formatDate(booking.refundProcessedAt)}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Clock size={16} className="text-amber-500" />
                      <div>
                        <p className="text-xs text-zinc-500">{t('cancel.refundPending')}</p>
                        <p className="text-sm font-semibold text-amber-400">{t('cancel.refundPendingDesc')}</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* QR Code */}
        {qrCode && (
          <div className="glass rounded-2xl p-6 border border-white/10 text-center">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              {isRTL ? 'رمز QR' : 'QR Code'}
            </h3>
            <div className="inline-block p-4 bg-white rounded-xl">
              <img src={qrCode} alt="QR Code" className="w-32 h-32" />
            </div>
            <p className="text-xs text-zinc-500 mt-3 font-mono">{booking.reference}</p>
          </div>
        )}
      </motion.div>
    </div>
  )
}
