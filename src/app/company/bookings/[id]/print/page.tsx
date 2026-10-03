'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Printer, ArrowLeft, Bus, MapPin, Clock, Calendar, User, Phone, CheckCircle, Loader2 } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface PairedBooking {
  id: string
  reference: string
  seatLabel: string
  total: number
  passengerName: string
  passengerHotel: string | null
  qrCode: string
  trip: { id: string; origin: string; destination: string; departure: string; arrival?: string }
}

interface TicketData {
  id: string
  reference: string
  seatLabel: string
  status: string
  total: number
  paidAt: string | null
  createdAt: string
  qrCode: string
  actualOrigin?: string
  actualDestination?: string
  actualDeparture?: string
  fromStopOrder?: number
  toStopOrder?: number
  roundTripGroupId?: string | null
  pairedBooking?: PairedBooking | null
  passengerName: string
  passengerPhone: string
  passengerHotel: string
  passengerNotes: string
  collectAmount: number | null
  companyName: string
  logoUrl?: string | null
  showLogoOnTicket?: boolean
  trip: {
    id: string
    origin: string
    destination: string
    departure: string
    arrival: string
    status: string
    bus: { name: string; type: string }
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

export default function CompanyPrintTicketPage() {
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
      const res = await fetch(`/api/company/bookings/${bookingId}/ticket`)
      if (res.ok) {
        const data = await res.json()
        setTicket(data)
      } else {
        router.push('/company/bookings')
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

  const statusConfig: Record<string, { color: string; label: { ar: string; en: string } }> = {
    PAID: { color: 'bg-emerald-400/20 text-emerald-200 border-emerald-400/30', label: { ar: 'مؤكد', en: 'CONFIRMED' } },
    PENDING: { color: 'bg-amber-400/20 text-amber-200 border-amber-400/30', label: { ar: 'قيد الانتظار', en: 'PENDING' } },
    CANCELLED: { color: 'bg-red-400/20 text-red-200 border-red-400/30', label: { ar: 'ملغي', en: 'CANCELLED' } },
    BOARDED: { color: 'bg-blue-400/20 text-blue-200 border-blue-400/30', label: { ar: 'صعد', en: 'BOARDED' } },
  }
  const status = statusConfig[ticket.status] || statusConfig.CANCELLED
  const isRoundTrip = !!ticket.roundTripGroupId

  return (
    <div className={cn('min-h-screen bg-zinc-100', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Controls - hidden when printing */}
      <div className="no-print sticky top-0 z-50 glass border-b border-white/10 bg-white/90 backdrop-blur px-6 py-4 flex items-center gap-4 shadow-md">
        <button
          onClick={() => router.push('/company/bookings')}
          className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white transition shadow"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="font-semibold text-white">
            {isRTL ? 'تذكرة الرحلة' : 'Trip Ticket'}
          </h1>
          <p className="text-xs text-zinc-400">
            {ticket.reference} — {status.label[isRTL ? 'ar' : 'en']}
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

      {/* Ticket */}
      <div className="max-w-2xl mx-auto p-6" ref={printRef}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-2xl overflow-hidden print:shadow-none print:rounded-none"
        >
          {/* Header bar */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {ticket.showLogoOnTicket && ticket.logoUrl && (
                  <div className="w-12 h-12 rounded-xl bg-white/10 p-1.5 flex items-center justify-center shrink-0">
                    <img src={ticket.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                  </div>
                )}
                <div>
                  <p className="text-xs text-blue-200 uppercase tracking-wider">
                    {isRTL ? 'تذكرة إلكترونية' : 'Electronic Ticket'}
                  </p>
                  <h2 className="text-2xl font-bold mt-1">{ticket.companyName}</h2>
                </div>
              </div>
              <div className="text-right space-y-2">
                {isRoundTrip && (
                  <div className={cn(
                    'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold bg-amber-400/20 text-amber-200 border border-amber-400/30',
                    isRTL ? 'ml-2' : 'mr-2'
                  )}>
                    {isRTL ? 'ذهاب وعودة' : 'ROUND TRIP'}
                  </div>
                )}
                <div className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold',
                  status.color
                )}>
                  {ticket.status === 'PAID' && <CheckCircle size={12} />}
                  {status.label[isRTL ? 'ar' : 'en']}
                </div>
              </div>
            </div>
          </div>

          {/* Route */}
          <div className="px-8 py-6 border-b bg-blue-50 border-blue-100">
            {isRoundTrip && ticket.pairedBooking ? (
              /* Merged round-trip route */
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-blue-600 to-amber-600">
                  <Bus size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl font-bold text-gray-800">{ticket.actualOrigin || ticket.trip.origin}</span>
                    <span className="text-gray-400">{isRTL ? '←' : '→'}</span>
                    <span className="text-xl font-bold text-blue-600">{(ticket.actualDestination || ticket.trip.destination)}</span>
                    <span className="text-gray-400">{isRTL ? '←' : '→'}</span>
                    <span className="text-xl font-bold text-amber-600">{ticket.pairedBooking.trip.destination}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-sm flex-wrap">
                    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-medium text-xs">
                      {formatDate(ticket.actualDeparture || ticket.trip.departure)} {formatTime(ticket.actualDeparture || ticket.trip.departure)}
                      <span className="font-bold ml-1">{ticket.seatLabel}</span>
                    </span>
                    <span className="text-gray-300 font-bold">{isRTL ? '←' : '→'}</span>
                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-medium text-xs">
                      {formatDate(ticket.pairedBooking.trip.arrival || ticket.pairedBooking.trip.departure)} {formatTime(ticket.pairedBooking.trip.arrival || ticket.pairedBooking.trip.departure)}
                      <span className="font-bold ml-1">{ticket.pairedBooking.seatLabel}</span>
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Single trip route */
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg bg-blue-600">
                  <Bus size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl font-bold text-gray-800">{ticket.actualOrigin || ticket.trip.origin}</span>
                    <span className="text-gray-400">{isRTL ? '←' : '→'}</span>
                    <span className="text-xl font-bold text-gray-800">{ticket.actualDestination || ticket.trip.destination}</span>
                    <span className="text-xs text-gray-500 mx-1">· {formatDate(ticket.actualDeparture || ticket.trip.departure)} {formatTime(ticket.actualDeparture || ticket.trip.departure)}</span>
                    <span className="font-mono text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">{ticket.seatLabel}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="px-8 py-6">
            <div className="grid grid-cols-2 gap-6">
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
                      <p className="font-semibold text-gray-800">{ticket.passengerName}</p>
                    </div>
                  </div>
                  {ticket.passengerPhone && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Phone size={14} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{isRTL ? 'الموبايل' : 'Phone'}</p>
                        <p className="font-semibold text-gray-800">{ticket.passengerPhone}</p>
                      </div>
                    </div>
                  )}
                  {ticket.passengerHotel && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                        <MapPin size={14} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{isRTL ? 'الفندق' : 'Hotel'}</p>
                        <p className="font-semibold text-gray-800">{ticket.passengerHotel}</p>
                      </div>
                    </div>
                  )}
                  {ticket.collectAmount != null && ticket.collectAmount > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                        <span className="text-gray-500 text-xs font-bold">{isRTL ? 'ج.م' : 'EGP'}</span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{isRTL ? 'مبلغ التحصيل' : 'Collect Amount'}</p>
                        <p className="font-semibold text-gray-800">{ticket.collectAmount.toFixed(2)} {isRTL ? 'ج.م' : 'EGP'}</p>
                      </div>
                    </div>
                  )}
                  {ticket.passengerNotes && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                        <span className="text-gray-500 text-xs">..</span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{isRTL ? 'ملاحظات' : 'Notes'}</p>
                        <p className="font-semibold text-gray-800 text-sm">{ticket.passengerNotes}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                  {isRTL ? 'معلومات الحجز' : 'Booking Details'}
                </h3>

                {isRoundTrip && ticket.pairedBooking ? (
                  /* Unified two-column card for round trip */
                  <div className="bg-blue-50 rounded-2xl border border-blue-100 overflow-hidden">
                    <div className="grid grid-cols-2 divide-x divide-blue-200">
                      {/* Outbound leg */}
                      <div className="p-4 text-center">
                        <p className="text-[10px] text-blue-500 uppercase tracking-wider mb-2 font-semibold">{isRTL ? 'ذهاب' : 'OUTBOUND'}</p>
                        <p className="text-sm font-mono font-bold text-blue-600 tracking-wider">{ticket.reference}</p>
                        <p className="text-xs text-gray-400 mt-2">{isRTL ? 'مقعد' : 'Seat'}: <span className="font-bold text-gray-800">{ticket.seatLabel}</span></p>
                        {ticket.passengerHotel && <p className="text-[10px] text-emerald-600 mt-0.5 font-medium">{ticket.passengerHotel}</p>}
                        <p className="text-[10px] text-gray-400 mt-1">{formatDate(ticket.actualDeparture || ticket.trip.departure)}</p>
                        <div className="flex justify-center mt-2">
                          <img src={ticket.qrCode} alt="QR" className="w-16 h-16 rounded-lg shadow-sm" />
                        </div>
                      </div>
                      {/* Return leg */}
                      <div className="p-4 text-center">
                        <p className="text-[10px] text-amber-500 uppercase tracking-wider mb-2 font-semibold">{isRTL ? 'عودة' : 'RETURN'}</p>
                        <p className="text-sm font-mono font-bold text-amber-600 tracking-wider">{ticket.pairedBooking.reference}</p>
                        <p className="text-xs text-gray-400 mt-2">{isRTL ? 'مقعد' : 'Seat'}: <span className="font-bold text-gray-800">{ticket.pairedBooking.seatLabel}</span></p>
                        {ticket.pairedBooking.passengerHotel && <p className="text-[10px] text-emerald-600 mt-0.5 font-medium">{ticket.pairedBooking.passengerHotel}</p>}
                        <p className="text-[10px] text-gray-400 mt-1">{formatDate(ticket.pairedBooking.trip.arrival || ticket.pairedBooking.trip.departure)}</p>
                        <div className="flex justify-center mt-2">
                          <img src={ticket.pairedBooking.qrCode} alt="QR" className="w-16 h-16 rounded-lg shadow-sm" />
                        </div>
                      </div>
                    </div>
                    {ticket.paidAt && (
                      <div className="p-2 text-center border-t border-blue-200/50">
                        <p className="text-[10px] text-gray-400">{isRTL ? 'تم الدفع في' : 'Paid at'} {formatDate(ticket.paidAt)} {formatTime(ticket.paidAt)}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Single booking reference card */
                  <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100 text-center">
                    <p className="text-xs text-blue-500 uppercase tracking-wider mb-2">{isRTL ? 'كود الحجز' : 'Booking Reference'}</p>
                    <p className="text-2xl font-mono font-bold text-blue-600 tracking-wider">{ticket.reference}</p>
                    <div className="mt-4 flex items-center justify-center gap-4">
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">{isRTL ? 'المقعد' : 'Seat'}</p>
                        <p className="text-xl font-bold text-gray-800">{ticket.seatLabel}</p>
                      </div>
                      <div className="w-px h-10 bg-gray-200" />
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">{isRTL ? 'المقعد' : 'Seat'}</p>
                        <p className="text-xl font-bold text-gray-800">{ticket.seatLabel}</p>
                      </div>
                    </div>
                    {ticket.paidAt && (
                      <p className="text-xs text-gray-400 mt-3">{isRTL ? 'تم الدفع في' : 'Paid at'} {formatDate(ticket.paidAt)} {formatTime(ticket.paidAt)}</p>
                    )}
                    {/* QR Code for single trip */}
                    <div className="flex items-center justify-center gap-4 pt-4">
                      <div className="relative">
                        <img src={ticket.qrCode} alt="QR Code" className="w-20 h-20 rounded-xl shadow-sm" />
                        <div className="absolute -inset-1 rounded-xl bg-blue-500/5 -z-10" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-gray-400">QR Code</p>
                        <p className="text-xs text-gray-500">{ticket.reference}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {isRTL ? 'احتفظ بهذه التذكرة للمراجعة عند الصعود' : 'Keep this ticket for inspection at boarding'}
            </p>
            <p className="text-xs text-gray-400">
              {isRTL ? 'جميع الحقوق محفوظة' : 'All rights reserved'}
            </p>
          </div>
        </motion.div>
      </div>

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
