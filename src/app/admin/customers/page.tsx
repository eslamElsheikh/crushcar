'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users, Search, Mail, Phone, Ticket, Calendar, Bus, MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface Booking {
  id: string
  reference: string
  status: string
  seatLabel: string
  total: number
  createdAt: string
  trip: {
    origin: string
    destination: string
    departure: string
    bus: { name: string }
  }
}

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  createdAt: string
  totalBookings: number
  totalSpent: number
  recentBookings: Booking[]
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const isRTL = true

  useEffect(() => { loadCustomers(1) }, [])

  async function loadCustomers(pageNum: number = 1) {
    setLoading(true)
    try {
      const q = search ? `&search=${encodeURIComponent(search)}` : ''
      const res = await fetch(`/api/customers?page=${pageNum}&take=20${q}`)
      const data = await res.json()
      setCustomers(data.data || [])
      if (data.pagination) {
        setTotal(data.pagination.total || 0)
        setTotalPages(data.pagination.pages || 1)
        setPage(data.pagination.page || 1)
      }
    } catch { /* empty */ } finally { setLoading(false) }
  }

  const totalSpent = customers.reduce((sum, c) => sum + c.totalSpent, 0)
  const totalBookings = customers.reduce((sum, c) => sum + c.totalBookings, 0)

  if (loading && customers.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Users size={24} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">العملاء</h1>
          <p className="text-zinc-400 text-sm">إدارة بيانات العملاء وحجوزاتهم</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5 border border-white/5"
        >
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{isRTL ? 'إجمالي العملاء' : 'Total Customers'}</p>
          <p className="text-2xl font-display font-bold text-white">{total}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-5 border border-white/5"
        >
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{isRTL ? 'إجمالي الحجوزات' : 'Total Bookings'}</p>
          <p className="text-2xl font-display font-bold text-blue-400">{totalBookings}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-5 border border-white/5"
        >
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{isRTL ? 'إجمالي الإيراد' : 'Total Revenue'}</p>
          <p className="text-2xl font-display font-bold text-emerald-400">{Math.round(totalSpent).toLocaleString()}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-5 border border-white/5"
        >
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{isRTL ? 'متوسط الحجز' : 'Avg per Customer'}</p>
          <p className="text-2xl font-display font-bold text-purple-400">
            {total > 0 ? Math.round(totalSpent / total).toLocaleString() : 0}
          </p>
        </motion.div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); loadCustomers(1) }}
          placeholder={isRTL ? 'ابحث بالاسم أو البريد أو رقم الموبايل...' : 'Search by name, email or phone...'}
          className="w-full pl-10 pr-4 py-3 rounded-xl glass border border-white/5 bg-zinc-900/50 text-white placeholder-zinc-600 focus:border-blue-500/50 outline-none transition"
        />
      </div>

      {/* Customers list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-20 glass rounded-3xl border border-white/5">
          <Users size={48} className="mx-auto text-zinc-700 mb-4" />
          <p className="text-zinc-400">{isRTL ? 'مفيش عملاء' : 'No customers found'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {customers.map((customer, i) => (
            <div key={customer.id} className="glass rounded-2xl border border-white/5 overflow-hidden">
              <div
                className="flex items-center justify-between p-6 cursor-pointer hover:bg-white/[0.02] transition"
                onClick={() => setExpanded(expanded === customer.id ? null : customer.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-blue-500/20">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{customer.name}</h3>
                    <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-zinc-500">
                      <span className="flex items-center gap-1.5">
                        <Mail size={12} />
                        {customer.email}
                      </span>
                      {customer.phone && (
                        <span className="flex items-center gap-1.5">
                          <Phone size={12} />
                          {customer.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-center hidden sm:block">
                    <p className="text-xl font-bold text-white">{customer.totalBookings}</p>
                    <p className="text-xs text-zinc-500">{isRTL ? 'حجز' : 'Bookings'}</p>
                  </div>
                  <div className="text-center hidden sm:block">
                    <p className="text-xl font-bold text-emerald-400">{Math.round(customer.totalSpent).toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">EGP</p>
                  </div>
                  <div className="text-center hidden md:block">
                    <p className="text-sm text-zinc-400">{formatDate(customer.createdAt)}</p>
                    <p className="text-xs text-zinc-600">{isRTL ? 'سجل منذ' : 'Joined'}</p>
                  </div>
                  <button className="p-2 rounded-xl hover:bg-white/5 transition text-zinc-400">
                    {expanded === customer.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>
              </div>

              {expanded === customer.id && customer.recentBookings.length > 0 && (
                <div className="border-t border-white/5 bg-zinc-900/30 p-6">
                  <h4 className="text-xs uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
                    <Ticket size={14} />
                    {isRTL ? 'آخر الحجوزات' : 'Recent Bookings'}
                  </h4>
                  <div className="space-y-3">
                    {customer.recentBookings.map((booking) => (
                      <div key={booking.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 border border-white/5">
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-sm font-bold text-blue-400 bg-blue-500/5 px-3 py-1.5 rounded-lg border border-blue-500/10">
                            {booking.reference}
                          </span>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="flex items-center gap-1.5 text-zinc-400">
                              <MapPin size={12} className="text-blue-400" />
                              {booking.trip.origin}
                              <span className="text-zinc-600 mx-1">→</span>
                              {booking.trip.destination}
                            </span>
                            <span className="flex items-center gap-1.5 text-zinc-500">
                              <Bus size={12} />
                              {booking.trip.bus.name}
                            </span>
                            <span className="font-mono text-white bg-zinc-700 px-2 py-0.5 rounded text-xs font-bold">
                              {booking.seatLabel}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <Calendar size={12} />
                            {formatDate(booking.trip.departure)} {formatTime(booking.trip.departure)}
                          </span>
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium',
                            booking.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            booking.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            'bg-red-500/10 text-red-400 border-red-500/20'
                          )}>
                            {booking.status === 'PAID' ? (isRTL ? 'مدفوع' : 'PAID') :
                             booking.status === 'PENDING' ? (isRTL ? 'معلق' : 'PENDING') :
                             (isRTL ? 'ملغي' : 'CANCELLED')}
                          </span>
                          <span className="text-white font-semibold text-base">
                            {Math.round(booking.total).toLocaleString()}
                            <span className="text-xs text-zinc-500 ml-1">EGP</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800/30 mt-4">
          <p className="text-xs text-zinc-500">
            {isRTL ? 'صفحة' : 'Page'} {page} {isRTL ? 'من' : 'of'} {totalPages} — {total} {isRTL ? 'عميل' : 'customers'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadCustomers(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg text-sm glass border border-zinc-800 hover:bg-zinc-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              {isRTL ? '→' : '←'} {isRTL ? 'السابق' : 'Prev'}
            </button>
            <span className="px-3 py-1.5 text-sm text-zinc-400 font-mono">{page} / {totalPages}</span>
            <button
              onClick={() => loadCustomers(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-sm glass border border-zinc-800 hover:bg-zinc-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              {isRTL ? 'السابق' : 'Next'} {isRTL ? '←' : '→'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}