'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Ticket, Search, Plus, Eye } from 'lucide-react'
import Link from 'next/link'
import { useLangStore } from '@/lib/lang'

export default function CompanyBookings() {
  const t = useLangStore((s) => s.t)
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, take: 20, total: 0, pages: 0 })

  const fetchBookings = () => {
    setLoading(true)
    const params = new URLSearchParams({ page: page.toString(), take: '20' })
    if (status) params.set('status', status)
    if (q) params.set('q', q)

    fetch(`/api/company/bookings?${params}`)
      .then(r => r.json())
      .then(data => {
        setBookings(data.data || [])
        setPagination(data.pagination)
        setLoading(false)
      })
  }

  useEffect(() => { fetchBookings() }, [status, page])

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-500/20 text-amber-400 border-amber-500/20',
    PAID: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20',
    CANCELLED: 'bg-red-500/20 text-red-400 border-red-500/20',
    BOARDED: 'bg-blue-500/20 text-blue-400 border-blue-500/20',
  }

  const statusLabels: Record<string, string> = {
    PENDING: t('payment.pending'),
    PAID: t('payment.confirmed'),
    CANCELLED: t('booking.cancelled') || 'Cancelled',
    BOARDED: t('booking.boarded') || 'Boarded',
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('company.bookings')}</h1>
        <Link href="/company/bookings/new" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition text-sm">
          <Plus size={16} /> {t('company.newBooking')}
        </Link>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchBookings()}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm [&>option]:bg-zinc-900 [&>option]:text-white"
        >
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="BOARDED">Boarded</option>
        </select>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-zinc-500">
          <Ticket size={48} className="mx-auto mb-3 opacity-30" />
          <p>{t('company.noBookings')}</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-2xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">Ref</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">Passenger</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">Route</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">Seat</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">Total</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">Date</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="px-4 py-3 text-white font-mono text-xs">{b.reference}</td>
                    <td className="px-4 py-3 text-zinc-300">{b.passengerName || '-'}</td>
                    <td className="px-4 py-3 text-zinc-300">
                      {b.actualOrigin || b.trip?.origin} → {b.actualDestination || b.trip?.destination}
                    </td>
                    <td className="px-4 py-3 text-white">{b.seatLabel}</td>
                    <td className="px-4 py-3 text-white font-semibold">{b.total.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs border ${statusColors[b.status]}`}>
                        {statusLabels[b.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{new Date(b.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link href={`/company/bookings/${b.id}`} className="text-blue-400 hover:text-blue-300">
                        <Eye size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <p className="text-xs text-zinc-500">
                {pagination.total} total · Page {pagination.page} of {pagination.pages}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 rounded-lg bg-white/5 text-zinc-400 disabled:opacity-30 hover:bg-white/10 transition text-sm"
                >
                  Prev
                </button>
                <button
                  disabled={page >= pagination.pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 rounded-lg bg-white/5 text-zinc-400 disabled:opacity-30 hover:bg-white/10 transition text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
