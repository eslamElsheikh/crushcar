'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Printer, ArrowLeft, Bus, MapPin, Clock, Calendar, User, Phone, Mail, QrCode, CheckCircle, Loader2 } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface TicketData {
  id: string
  reference: string
  seatLabel: string
  status: string
  total: number
  paidAt: string | null
  createdAt: string
  qrCode: string
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
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

export default function PrintTicketPage() {
  const params = useParams()
  const router = useRouter()
  const bookingId = params.id as string
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const [ticket, setTicket] = useState<TicketData | null>(null)
  const [loading, setLoading] = useState(true)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadTicket()
  }, [bookingId])

  async function loadTicket() {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/ticket`)
      if (res.ok) {
        const data = await res.json()
        setTicket(data)
      } else {
        router.push('/bookings')
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    )
  }

  if (!ticket) return null

  const isPaid = ticket.status === 'PAID'

  return (
    <div className={cn('min-h-screen bg-zinc-100', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Controls - hidden when printing */}
      <div className="no-print sticky top-0 z-50 glass border-b border-white/10 bg-white/90 backdrop-blur px-6 py-4 flex items-center gap-4 shadow-md">
        <button
          onClick={() => router.push('/bookings')}
          className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white transition shadow"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="font-semibold text-white">
            {isRTL ? 'تذكرة الرحلة' : 'Trip Ticket'}
          </h1>
          <p className="text-xs text-zinc-400">
            {ticket.reference} — {isPaid ? (isRTL ? 'مؤكد' : 'Confirmed') : (isRTL ? 'ملغي' : 'Cancelled')}
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm shadow-lg transition"
        >
          <Printer size={16} />
          {isRTL ? 'اطبع التذكرة' : 'Print Ticket'}
        </button>
      </div>

      {/* Ticket - visible when printing */}
      <div className="max-w-2xl mx-auto p-6" ref={printRef}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-2xl overflow-hidden print:shadow-none print:rounded-none"
        >
          {/* Header bar */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-200 uppercase tracking-wider">
                  {isRTL ? 'تذكرة إلكترونية' : 'Electronic Ticket'}
                </p>
                <h2 className="text-2xl font-bold mt-1">{ticket.trip.bus.company.name}</h2>
                <p className="text-blue-200 text-sm mt-1">
                  {isRTL ? 'CrushCar - نظام حجز الباصات' : 'CrushCar - Bus Booking System'}
                </p>
              </div>
              <div className="text-left">
                <div className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold',
                  isPaid ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30' : 'bg-red-400/20 text-red-200 border border-red-400/30'
                )}>
                  {isPaid && <CheckCircle size={12} />}
                  {isPaid ? (isRTL ? 'مؤكد - CONFIRMED' : 'CONFIRMED') : (isRTL ? 'ملغي - CANCELLED' : 'CANCELLED')}
                </div>
              </div>
            </div>
          </div>

          {/* Route & time */}
          <div className="px-8 py-6 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
                  <Bus size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-gray-800">{ticket.trip.origin}</span>
                    <span className="text-2xl text-gray-400">→</span>
                    <span className="text-2xl font-bold text-gray-800">{ticket.trip.destination}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} />
                      {formatDate(ticket.trip.departure)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} />
                      {formatTime(ticket.trip.departure)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Bus size={14} />
                      {ticket.trip.bus.name}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Booking details */}
          <div className="px-8 py-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Left - customer info */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                  {isRTL ? 'معلومات المسافر' : 'Passenger Information'}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <User size={14} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">{isRTL ? 'الاسم' : 'Name'}</p>
                      <p className="font-semibold text-gray-800">{ticket.user.name}</p>
                    </div>
                  </div>
                  {ticket.user.phone && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Phone size={14} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{isRTL ? 'الموبايل' : 'Phone'}</p>
                        <p className="font-semibold text-gray-800">{ticket.user.phone}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Mail size={14} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">{isRTL ? 'البريد' : 'Email'}</p>
                      <p className="font-semibold text-gray-800 text-sm">{ticket.user.email}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right - booking info */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                  {isRTL ? 'معلومات الحجز' : 'Booking Details'}
                </h3>

                {/* Reference + Seat */}
                <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100 text-center">
                  <p className="text-xs text-blue-500 uppercase tracking-wider mb-2">
                    {isRTL ? 'كود الحجز' : 'Booking Reference'}
                  </p>
                  <p className="text-2xl font-mono font-bold text-blue-600 tracking-wider">
                    {ticket.reference}
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-1">{isRTL ? 'المقعد' : 'Seat'}</p>
                      <p className="text-xl font-bold text-gray-800">{ticket.seatLabel}</p>
                    </div>
                    <div className="w-px h-10 bg-gray-200" />
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-1">{isRTL ? 'المبلغ' : 'Amount'}</p>
                      <p className="text-xl font-bold text-emerald-600">
                        {Math.round(ticket.total).toLocaleString()}
                        <span className="text-xs font-normal text-gray-400 ml-1">EGP</span>
                      </p>
                    </div>
                  </div>
                  {ticket.paidAt && (
                    <p className="text-xs text-gray-400 mt-3">
                      {isRTL ? 'تم الدفع في' : 'Paid at'} {formatDate(ticket.paidAt)} {formatTime(ticket.paidAt)}
                    </p>
                  )}
                </div>

                {/* QR Code */}
                <div className="flex items-center justify-center gap-4 pt-2">
                  <div className="relative">
                    <img
                      src={ticket.qrCode}
                      alt="QR Code"
                      className="w-20 h-20 rounded-xl shadow-sm"
                    />
                    <div className="absolute -inset-1 rounded-xl bg-blue-500/5 -z-10" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-gray-400">QR Code</p>
                    <p className="text-xs text-gray-500">{ticket.reference}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {isRTL ? 'احتفظ بهذه التذكرة للمراجعة عند الصعود' : 'Keep this ticket for inspection at boarding'}
            </p>
            <p className="text-xs text-gray-400">
              {isRTL ? 'CrushCar © 2025' : 'CrushCar © 2025'} • crushcar.app
            </p>
          </div>
        </motion.div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .min-h-screen { min-height: auto !important; }
          .max-w-2xl { max-width: none !important; }
          .p-6 { padding: 0 !important; }
          .shadow-2xl { box-shadow: none !important; }
          .rounded-3xl { border-radius: 0 !important; }
        }
      `}</style>
    </div>
  )
}