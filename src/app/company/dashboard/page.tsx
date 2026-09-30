'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, Wallet, TrendingUp, Ticket, ArrowUpRight, FileText } from 'lucide-react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useLangStore } from '@/lib/lang'

interface CreditStatus {
  company: any
  availableCredit: number
  walletBalance: number
  outstandingBalance: number
  totalBookings: number
  totalSpent: number
}

export default function CompanyDashboard() {
  const { data: session } = useSession()
  const t = useLangStore((s) => s.t)
  const [data, setData] = useState<CreditStatus | null>(null)
  const [recentBookings, setRecentBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/company/credit').then(r => r.json()),
      fetch('/api/company/bookings?take=5').then(r => r.json()),
    ]).then(([credit, bookings]) => {
      setData(credit)
      setRecentBookings(bookings.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    )
  }

  if (!data) return <div className="text-center text-zinc-400">Error loading data</div>

  const statCards = [
    {
      label: t('company.walletBalance'),
      value: `${data.walletBalance.toFixed(2)} EGP`,
      icon: Wallet,
      color: 'from-emerald-500/20 to-emerald-500/5',
      borderColor: 'border-emerald-500/20',
      iconColor: 'text-emerald-400',
    },
    {
      label: t('company.availableCredit'),
      value: `${data.availableCredit.toFixed(2)} EGP`,
      icon: CreditCard,
      color: 'from-blue-500/20 to-blue-500/5',
      borderColor: 'border-blue-500/20',
      iconColor: 'text-blue-400',
    },
    {
      label: t('company.outstanding'),
      value: `${data.outstandingBalance.toFixed(2)} EGP`,
      icon: TrendingUp,
      color: 'from-amber-500/20 to-amber-500/5',
      borderColor: 'border-amber-500/20',
      iconColor: 'text-amber-400',
    },
    {
      label: t('company.totalBookings'),
      value: data.totalBookings.toString(),
      icon: Ticket,
      color: 'from-purple-500/20 to-purple-500/5',
      borderColor: 'border-purple-500/20',
      iconColor: 'text-purple-400',
    },
  ]

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold text-white">
          {t('company.welcome')}, {session?.user?.name}
        </h1>
        <p className="text-zinc-400 mt-1">{data.company.name}</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`glass rounded-2xl p-6 bg-gradient-to-br ${card.color} ${card.borderColor} border`}
          >
            <div className="flex items-center justify-between mb-4">
              <card.icon size={24} className={card.iconColor} />
            </div>
            <p className="text-2xl font-bold text-white">{card.value}</p>
            <p className="text-sm text-zinc-400 mt-1">{card.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 glass rounded-2xl p-6 border border-white/5"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">{t('company.recentBookings')}</h2>
            <Link href="/company/bookings" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
              {t('company.bookings')} <ArrowUpRight size={14} />
            </Link>
          </div>

          {recentBookings.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <Ticket size={48} className="mx-auto mb-3 opacity-30" />
              <p>{t('company.noBookings')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 transition">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Ticket size={18} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{booking.reference}</p>
                      <p className="text-xs text-zinc-500">
                        {booking.actualOrigin || booking.trip?.origin} → {booking.actualDestination || booking.trip?.destination}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">{booking.total.toFixed(2)} EGP</p>
                    <p className="text-xs text-zinc-500">Seat {booking.seatLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-2xl p-6 border border-white/5"
        >
          <h2 className="text-xl font-bold text-white mb-6">{t('company.quickActions')}</h2>
          <div className="space-y-3">
            <Link
              href="/company/bookings/new"
              className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-blue-500/20 to-blue-500/5 border border-blue-500/20 hover:border-blue-500/40 transition text-white"
            >
              <Ticket size={20} className="text-blue-400" />
              <span className="font-medium">{t('company.newBooking')}</span>
            </Link>
            <Link
              href="/company/credit"
              className="flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition text-zinc-300"
            >
              <Wallet size={20} />
              <span>{t('company.deposit')}</span>
            </Link>
            <Link
              href="/company/invoices"
              className="flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition text-zinc-300"
            >
              <FileText size={20} />
              <span>{t('company.viewInvoices')}</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
