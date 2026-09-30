'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Ticket, Search, Bus, MapPin, Clock, CheckCircle, XCircle, AlertCircle, X, Pencil, User, Phone } from 'lucide-react'
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
  actualOrigin?: string
  actualDestination?: string
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
  const [tab, setTab] = useState<'customer' | 'company'>('customer')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [refSearch, setRefSearch] = useState('')
  const [foundBooking, setFoundBooking] = useState<Booking | null>(null)
  const [refError, setRefError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [confirmModalBookingId, setConfirmModalBookingId] = useState<string | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [editModalBooking, setEditModalBooking] = useState<any | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editHotel, setEditHotel] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  useEffect(() => { loadBookings(1) }, [tab])

  async function loadBookings(pageNum: number = 1) {
    setLoading(true)
    try {
      const q = search ? `&q=${encodeURIComponent(search)}` : ''
      const typeParam = tab === 'company' ? '&type=company' : ''
      const res = await fetch(`/api/bookings?page=${pageNum}&take=20${q}${typeParam}`, { credentials: 'include' })
      const data = await res.json()
      setBookings(Array.isArray(data) ? data : (data.data || []))
      if (data.pagination) {
        setTotal(data.pagination.total)
        setTotalPages(data.pagination.pages || 1)
        setPage(data.pagination.page)
      }
    } catch {} finally { setLoading(false) }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    loadBookings(1)
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

  async function handleConfirmPayment() {
    if (!confirmModalBookingId) return
    setConfirmLoading(true)
    try {
      await fetch(`/api/bookings/${confirmModalBookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAID' }),
        credentials: 'include',
      })
      loadBookings()
      setConfirmModalBookingId(null)
    } catch {}
    setConfirmLoading(false)
  }

  function openEditModal(booking: any) {
    setEditName(booking.passengerName || '')
    setEditPhone(booking.passengerPhone || '')
    setEditHotel(booking.passengerHotel || '')
    setEditModalBooking(booking)
  }

  async function handleEditSave() {
    if (!editModalBooking) return
    setEditLoading(true)
    try {
      const isCompany = (editModalBooking as any)._type === 'company'
      const endpoint = isCompany ? `/api/company/bookings/${editModalBooking.id}` : `/api/bookings/${editModalBooking.id}`
      const body = { action: 'UPDATE', passengerName: editName, passengerPhone: editPhone, passengerHotel: editHotel }
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      })
      if (res.ok) {
        toast.success(isRTL ? 'تم التعديل' : 'Updated')
        loadBookings()
        setEditModalBooking(null)
      } else {
        const data = await res.json()
        toast.error(data.message || data.error)
      }
    } catch {}
    setEditLoading(false)
  }

  const totalRevenue = bookings.filter(b => b.status === 'PAID').reduce((sum, b) => sum + b.total, 0)
  const paidCount = bookings.filter(b => b.status === 'PAID').length

  return (
    <div className={cn(isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Summary Cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: isRTL ? 'إجمالي الحجز' : 'Total Bookings', value: total, color: 'blue', icon: <Ticket size={18} /> },
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
                  {foundBooking.actualOrigin || foundBooking.trip.origin}
                  <span className="text-zinc-600 mx-1">{isRTL ? '←' : '→'}</span>
                  {foundBooking.actualDestination || foundBooking.trip.destination}
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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 glass rounded-xl w-fit">
        <button onClick={() => setTab('customer')} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition', tab === 'customer' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'text-zinc-400 hover:text-white')}>
          {isRTL ? 'حجوزات العملاء' : 'Customer Bookings'}
        </button>
        <button onClick={() => setTab('company')} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition', tab === 'company' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' : 'text-zinc-400 hover:text-white')}>
          {isRTL ? 'حجوزات الشركات' : 'Company Bookings'}
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold">{isRTL ? 'سجل الحجز' : 'Bookings'}</h1>
          <p className="text-zinc-400 mt-1 text-sm">{isRTL ? `إجمالي ${total} حجز` : `${total} total bookings`}</p>
        </div>
        <form onSubmit={handleSearch} className="relative">
          <Search size={16} className={cn('absolute top-1/2 -translate-y-1/2 text-zinc-500', isRTL ? 'right-3' : 'left-3')} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn('pl-9 pr-4 py-2.5 rounded-xl glass text-sm focus:outline-none focus:border-blue-500 border border-zinc-800 w-72 transition', isRTL && 'pr-9 pl-4')}
            placeholder={isRTL ? 'ابحث بالكود أو الاسم...' : 'Search by code or name...'}
          />
        </form>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
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
                  <th className={cn('px-5 py-4 font-medium text-center')}>{isRTL ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking, i) => {
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
                        <p className="text-sm font-medium text-white">
                          {(booking as any)._type === 'company'
                            ? ((booking as any).company?.name || booking.passengerName || (isRTL ? 'شركة' : 'Company'))
                            : (booking.user?.name || (isRTL ? 'غير معروف' : 'Unknown'))}
                          {(booking as any)._type === 'company' && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 align-middle">{isRTL ? 'شركة' : 'BIZ'}</span>
                          )}
                        </p>
                        <p className="text-xs text-zinc-500">{(booking as any)._type === 'company' ? (isRTL ? 'حجز شركة' : 'Company Booking') : (booking.user?.email || '')}</p>
                      </td>

                      {/* Route */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-sm">
                          <MapPin size={12} className="text-blue-400 flex-shrink-0" />
                          <span>{booking.actualOrigin || booking.trip?.origin}</span>
                          <span className="text-zinc-600">{isRTL ? '←' : '→'}</span>
                          <span>{booking.actualDestination || booking.trip?.destination}</span>
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

                      {/* Paid At / Confirm Payment */}
                      <td className="px-5 py-4">
                        {booking.paidAt ? (
                          <div className="text-sm">
                            <p className="text-emerald-400">{formatDate(booking.paidAt)}</p>
                            <p className="text-xs text-zinc-500">{formatTime(booking.paidAt)}</p>
                          </div>
                        ) : booking.status === 'PENDING' && (booking as any)._type !== 'company' ? (
                          <button
                            onClick={() => setConfirmModalBookingId(booking.id)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition font-medium"
                          >
                            {isRTL ? 'تأكيد الدفع' : 'Confirm Payment'}
                          </button>
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

                      {/* Actions */}
                      <td className="px-5 py-4 text-center">
                        <button
                          onClick={() => openEditModal(booking)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-zinc-700/50 text-zinc-300 border border-zinc-600/50 hover:bg-zinc-700 transition font-medium"
                        >
                          <Pencil size={12} className="inline mr-1" />
                          {isRTL ? 'تعديل' : 'Edit'}
                        </button>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800/30">
              <p className="text-xs text-zinc-500">
                {isRTL ? 'صفحة' : 'Page'} {page} {isRTL ? 'من' : 'of'} {totalPages}
                {' — '}
                {isRTL ? `${total} حجز` : `${total} bookings`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadBookings(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg text-sm glass border border-zinc-800 hover:bg-zinc-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  {isRTL ? '→' : '←'} {isRTL ? 'السابق' : 'Prev'}
                </button>
                <span className="px-3 py-1.5 text-sm text-zinc-400 font-mono">{page} / {totalPages}</span>
                <button
                  onClick={() => loadBookings(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm glass border border-zinc-800 hover:bg-zinc-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  {isRTL ? 'السابق' : 'Next'} {isRTL ? '←' : '→'}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Confirm Payment Modal */}
      {confirmModalBookingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !confirmLoading && setConfirmModalBookingId(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative glass rounded-2xl p-8 max-w-sm w-full border border-zinc-700 shadow-2xl"
          >
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} className="text-emerald-400" />
              </div>
              <h3 className={cn('text-lg font-bold text-white mb-2', isRTL && 'font-[Cairo]')}>
                {isRTL ? 'تأكيد استلام الدفع' : 'Confirm Payment Received'}
              </h3>
              <p className="text-sm text-zinc-400">
                {isRTL ? 'هل أنت متأكد من استلام الدفع لهذا الحجز؟' : 'Are you sure you have received payment for this booking?'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModalBookingId(null)}
                disabled={confirmLoading}
                className="flex-1 py-2.5 rounded-xl glass border border-zinc-700 text-zinc-400 hover:text-white hover:bg-white/5 transition text-sm font-medium disabled:opacity-50"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={confirmLoading}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold transition"
              >
                {confirmLoading ? (isRTL ? 'جارٍ...' : 'Confirming...') : (isRTL ? 'تأكيد' : 'Confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Booking Modal */}
      {editModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !editLoading && setEditModalBooking(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative glass rounded-2xl p-8 max-w-sm w-full border border-zinc-700 shadow-2xl"
          >
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-zinc-700/50 border border-zinc-600/50 flex items-center justify-center mx-auto mb-4">
                <Pencil size={22} className="text-zinc-300" />
              </div>
              <h3 className={cn('text-lg font-bold text-white mb-2', isRTL && 'font-[Cairo]')}>
                {isRTL ? 'تعديل بيانات الحجز' : 'Edit Booking'}
              </h3>
              <p className="text-sm text-zinc-400">
                {editModalBooking.reference} — {editModalBooking.seatLabel}
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={isRTL ? 'اسم المسافر' : 'Passenger name'}
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 text-sm"
                />
              </div>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder={isRTL ? 'رقم التليفون' : 'Phone number'}
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 text-sm"
                />
            </div>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={editHotel}
                onChange={(e) => setEditHotel(e.target.value)}
                placeholder={isRTL ? 'اسم الفندق' : 'Hotel name'}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 text-sm"
              />
            </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditModalBooking(null)}
                disabled={editLoading}
                className="flex-1 py-2.5 rounded-xl glass border border-zinc-700 text-zinc-400 hover:text-white hover:bg-white/5 transition text-sm font-medium disabled:opacity-50"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleEditSave}
                disabled={editLoading}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold transition"
              >
                {editLoading ? (isRTL ? 'جارٍ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}