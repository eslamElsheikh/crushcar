'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Ticket, Search, Bus, MapPin, Clock, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'
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
  user: { name: string; email: string }
  trip: {
    origin: string
    destination: string
    departure: string
    bus: { name: string }
  }
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: { ar: string; en: string } }> = {
  PAID: {
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: <CheckCircle size={12} />,
    label: { ar: 'مدفوع', en: 'PAID' },
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

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [refSearch, setRefSearch] = useState('')
  const [foundBooking, setFoundBooking] = useState<Booking | null>(null)
  const [refError, setRefError] = useState('')
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  useEffect(() => {
    loadBookings()
  }, [])

  async function loadBookings() {
    try {
      const res = await fetch('/api/bookings')
      const data = await res.json()
      setBookings(Array.isArray(data) ? data : (data.data || []))
    } catch {
    } finally {
      setLoading(false)
    }
  }

  function handleRefSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!refSearch.trim()) return
    const exact = bookings.find(b => b.reference.toLowerCase() === refSearch.trim().toLowerCase())
    if (exact) {
      setFoundBooking(exact)
      setRefError('')
    } else {
      setFoundBooking(null)
      setRefError(isRTL ? 'كود الحجز مش موجود' : 'Booking not found')
    }
  }

  const filtered = bookings.filter(
    (b) =>
      b.reference.toLowerCase().includes(search.toLowerCase()) ||
      b.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
      b.passengerName?.toLowerCase().includes(search.toLowerCase()) ||
      b.seatLabel.toLowerCase().includes(search.toLowerCase()) ||
      b.trip?.origin?.toLowerCase().includes(search.toLowerCase()) ||
      b.trip?.destination?.toLowerCase().includes(search.toLowerCase())
  )

  const totalRevenue = filtered.filter(b => b.status === 'PAID').reduce((sum, b) => sum + b.total, 0)
  const paidCount = filtered.filter(b => b.status === 'PAID').length

  return (
    <div className={cn(isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Summary Cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: isRTL ? 'إجمالي الحجز' : 'Total Bookings', value: filtered.length, color: 'blue', icon: <Ticket size={18} /> },
          { label: isRTL ? 'المدفوع' : 'Paid', value: paidCount, color: 'emerald', icon: <CheckCircle size={18} /> },
          { label: isRTL ? 'إجمالي الإيراد' : 'Total Revenue', value: `${Math.round(totalRevenue).toLocaleString()} ${isRTL ? 'ج.م' : 'EGP'}`, color: 'purple', icon: <Clock size={18} /> },
        ].map((card) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn('glass rounded-xl p-5 border', card.color === 'blue' && 'border-blue-500/10', card.color === 'emerald' && 'border-emerald-500/10', card.color === 'purple' && 'border-purple-500/10')}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 mb-1">{card.label}</p>
                <p className={cn('text-2xl font-display font-bold', card.color === 'blue' && 'text-blue-400', card.color === 'emerald' && 'text-emerald-400', card.color === 'purple' && 'text-purple-400')}>{card.value}</p>
              </div>
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', card.color === 'blue' && 'bg-blue-500/10', card.color === 'emerald' && 'bg-emerald-500/10', card.color === 'purple' && 'bg-purple-500/10')}>
                <span className={cn(card.color === 'blue' && 'text-blue-400', card.color === 'emerald' && 'text-emerald-400', card.color === 'purple' && 'text-purple-400')}>{card.icon}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Reference Search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6 glass rounded-2xl p-5 border border-purple-500/10"
      >
        <h3 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
          <Search size={14} />
          {isRTL ? 'البحث السريع بالكود' : 'Quick Lookup by Code'}
        </h3>
        <form onSubmit={handleRefSearch} className="flex gap-3">
          <input
            type="text"
            value={refSearch}
            onChange={(e) => { setRefSearch(e.target.value); setRefError('') }}
            placeholder={isRTL ? 'اكتب كود الحجز...' : 'Enter booking code...'}
            className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 text-white placeholder-zinc-600 focus:border-purple-500/50 outline-none transition text-sm font-mono"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold transition"
          >
            {isRTL ? 'بحث' : 'Search'}
          </button>
        </form>
        {refError && <p className="text-xs text-red-400 mt-2">{refError}</p>}

        {/* Found booking */}
        {foundBooking && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-mono text-lg font-bold text-blue-400">{foundBooking.reference}</span>
                <span className="flex items-center gap-2 text-sm text-zinc-400">
                  <MapPin size={12} className="text-blue-400" />
                  {foundBooking.trip.origin}
                  <span className="text-zinc-600 mx-1">→</span>
                  {foundBooking.trip.destination}
                </span>
                <span className="font-mono text-sm text-white bg-zinc-800 px-2 py-0.5 rounded">{foundBooking.seatLabel}</span>
                {foundBooking.passengerName && (
                  <span className="text-sm text-amber-400/70 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">{foundBooking.passengerName}</span>
                )}
                <span className="text-sm text-zinc-500">{foundBooking.user?.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border',
                  foundBooking.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  foundBooking.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  'bg-red-500/10 text-red-400 border-red-500/20'
                )}>
                  {foundBooking.status === 'PAID' ? (isRTL ? 'مدفوع' : 'PAID') :
                   foundBooking.status === 'PENDING' ? (isRTL ? 'معلق' : 'PENDING') :
                   (isRTL ? 'ملغي' : 'CANCELLED')}
                </span>
                <span className="text-white font-bold">{Math.round(foundBooking.total).toLocaleString()} EGP</span>
                <button
                  onClick={() => { setFoundBooking(null); setRefSearch('') }}
                  className="text-xs text-zinc-500 hover:text-white transition p-1"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold">{isRTL ? 'سجل الحجز' : 'Bookings'}</h1>
          <p className="text-zinc-400 mt-1 text-sm">{isRTL ? 'كل الحجوزات والتأكيدات' : 'All reservations and confirmations'}</p>
        </div>
        <div className="relative">
          <Search size={16} className={cn('absolute top-1/2 -translate-y-1/2 text-zinc-500', isRTL ? 'right-3' : 'left-3')} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn('pl-9 pr-4 py-2.5 rounded-xl glass text-sm focus:outline-none focus:border-blue-500 border border-zinc-800 w-72 transition', isRTL && 'pr-9 pl-4')}
            placeholder={isRTL ? 'ابحث بالكود أو الاسم...' : 'Search by code or name...'}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 glass rounded-xl">
          <Ticket size={48} className="mx-auto text-zinc-700 mb-4" />
          <h3 className="text-lg font-medium mb-2">{isRTL ? 'مفيش حجز لحد كده' : 'No bookings found'}</h3>
          <p className="text-zinc-500 text-sm">{isRTL ? 'الحجوزات هتظهر هنا لما العملاء يحجزوا' : 'Bookings will appear here when customers reserve seats'}</p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-xl overflow-hidden border border-zinc-800/50">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                  <th className={cn('px-5 py-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{isRTL ? 'كود الحجز' : 'REF CODE'}</th>
                  <th className={cn('px-5 py-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{isRTL ? 'العميل' : 'Customer'}</th>
                  <th className={cn('px-5 py-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{isRTL ? 'الرحلة' : 'Trip'}</th>
                  <th className={cn('px-5 py-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{isRTL ? 'المسافر' : 'Passenger'}</th>
                  <th className={cn('px-5 py-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{isRTL ? 'رقم المقعد' : 'Seat'}</th>
                  <th className={cn('px-5 py-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{isRTL ? 'رقم الباص' : 'Bus'}</th>
                  <th className={cn('px-5 py-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{isRTL ? 'موعد الرحلة' : 'Departure'}</th>
                  <th className={cn('px-5 py-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{isRTL ? 'وقت الدفع' : 'Paid At'}</th>
                  <th className={cn('px-5 py-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className={cn('px-5 py-4 font-medium text-right')}>{isRTL ? 'المبلغ' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((booking, i) => {
                  const status = statusConfig[booking.status] || statusConfig.PENDING
                  return (
                    <motion.tr
                      key={booking.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-zinc-800/30 hover:bg-zinc-800/10 transition-colors"
                    >
                      {/* Reference Code */}
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm font-bold text-blue-400 bg-blue-500/5 px-2.5 py-1 rounded-lg border border-blue-500/10">
                          {booking.reference}
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-white">{booking.user?.name || isRTL ? 'غير معروف' : 'Unknown'}</p>
                        <p className="text-xs text-zinc-500">{booking.user?.email}</p>
                      </td>

                      {/* Route */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-sm">
                          <MapPin size={12} className="text-blue-400 flex-shrink-0" />
                          <span>{booking.trip?.origin}</span>
                          <span className="text-zinc-600">→</span>
                          <span>{booking.trip?.destination}</span>
                        </div>
                      </td>

                      {/* Passenger */}
                      <td className="px-5 py-4">
                        {booking.passengerName ? (
                          <span className="text-sm text-amber-400/80 bg-amber-500/5 px-2.5 py-1 rounded-lg border border-amber-500/10">
                            {booking.passengerName}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Seat */}
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded-lg text-white">
                          {booking.seatLabel}
                        </span>
                      </td>

                      {/* Bus */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                          <Bus size={12} />
                          {booking.trip?.bus?.name || '-'}
                        </div>
                      </td>

                      {/* Departure */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                          <Clock size={12} className="flex-shrink-0" />
                          <div>
                            <p>{formatDate(booking.trip?.departure)}</p>
                            <p className="text-xs">{formatTime(booking.trip?.departure)}</p>
                          </div>
                        </div>
                      </td>

                      {/* Paid At */}
                      <td className="px-5 py-4">
                        {booking.paidAt ? (
                          <div className="text-sm">
                            <p className="text-emerald-400">{formatDate(booking.paidAt)}</p>
                            <p className="text-xs text-zinc-500">{formatTime(booking.paidAt)}</p>
                          </div>
                        ) : booking.status === 'PENDING' ? (
                          <span className="text-xs text-zinc-600">{isRTL ? 'لم يدفع' : 'Not paid'}</span>
                        ) : (
                          <span className="text-xs text-zinc-600">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border', status.color)}>
                          {status.icon}
                          {status.label[lang]}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-4 text-left">
                        <span className="font-display font-bold text-emerald-400">
                          {Math.round(booking.total).toLocaleString()}
                        </span>
                        <span className="text-xs text-zinc-500 ml-0.5">{isRTL ? 'ج.م' : 'EGP'}</span>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  )
}