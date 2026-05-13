'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Bus, Ticket, TrendingUp, Clock, ArrowRight, TrendingDown } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface Analytics {
  totalBookings: number
  totalRevenue: number
  activeTrips: number
  recentBookings: any[]
  chartData: { day: string; revenue: number }[]
}

export default function AdminDashboard() {
  const { data: session } = useSession()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const [data, setData] = useState<Analytics | null>(null)
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d')

  useEffect(() => {
    // Trigger trip status transitions and expired booking cleanup
    fetch('/api/jobs/transition', { method: 'POST', credentials: 'include' }).catch(() => {})
    // Load analytics
    fetch(`/api/analytics?range=${dateRange}`)
      .then((r) => r.json())
      .then(setData)
  }, [dateRange])

  const stats = [
    {
      labelKey: 'dashboard.totalBookings',
      value: data?.totalBookings ?? '...',
      icon: Ticket,
      color: 'blue',
      change: '+12%',
      positive: true,
    },
    {
      labelKey: 'dashboard.totalRevenue',
      value: data?.totalRevenue ? `${data.totalRevenue.toLocaleString()} ${t('common.currency')}` : '...',
      icon: TrendingUp,
      color: 'emerald',
      change: '+8%',
      positive: true,
    },
    {
      labelKey: 'dashboard.activeTrips',
      value: data?.activeTrips ?? '...',
      icon: Bus,
      color: 'purple',
      change: '+3',
      positive: true,
    },
    {
      labelKey: 'dashboard.todayRevenue',
      value: data?.chartData?.length
        ? `${(data.chartData[data.chartData.length - 1]?.revenue || 0).toLocaleString()} ${t('common.currency')}`
        : `0 ${t('common.currency')}`,
      icon: TrendingUp,
      color: 'amber',
      change: '+5%',
      positive: true,
    },
  ]

  return (
    <div className={isRTL ? 'font-[Cairo]' : ''}>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-display font-bold text-white">
          {t('dashboard.welcome')}, {session?.user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-zinc-400 mt-1">{t('dashboard.manageBuses')}</p>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.labelKey}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 200 }}
            whileHover={{ y: -2, scale: 1.01 }}
            className="glass rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-all duration-200 relative overflow-hidden group"
          >
            {/* Glow */}
            <div className={cn(
              'absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10',
              stat.color === 'blue' && 'bg-blue-500',
              stat.color === 'emerald' && 'bg-emerald-500',
              stat.color === 'purple' && 'bg-purple-500',
              stat.color === 'amber' && 'bg-amber-500',
            )} />

            <div className="flex items-start justify-between mb-5 relative">
              <div className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110',
                stat.color === 'blue' && 'bg-blue-500/10 text-blue-400',
                stat.color === 'emerald' && 'bg-emerald-500/10 text-emerald-400',
                stat.color === 'purple' && 'bg-purple-500/10 text-purple-400',
                stat.color === 'amber' && 'bg-amber-500/10 text-amber-400',
              )}>
                <stat.icon size={20} />
              </div>
              <span className={cn(
                'text-xs font-medium px-2.5 py-1 rounded-full',
                stat.positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
              )}>
                {stat.change}
              </span>
            </div>

            <p className="text-2xl font-display font-bold text-white mb-1">{stat.value}</p>
            <p className="text-xs text-zinc-500">{t(stat.labelKey)}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="lg:col-span-2 glass rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-all"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-white">{t('dashboard.revenueTrend')}</h3>
              <p className="text-xs text-zinc-500">{t('dashboard.last30days')}</p>
            </div>
            <div className="flex gap-1.5">
              {(['7d', '30d', '90d'] as const).map(r => (
                <button key={r} onClick={() => setDateRange(r)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    dateRange === r
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                      : 'text-zinc-500 hover:text-white'
                  )}>
                  {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
                </button>
              ))}
            </div>
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          </div>

          {data?.chartData && data.chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(24,24,27,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    backdropFilter: 'blur(12px)',
                  }}
                  labelStyle={{ color: '#a1a1aa' }}
                  formatter={(value: any) => [`${Number(value).toLocaleString()} ${t('common.currency')}`, t('dashboard.totalRevenue')]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-zinc-500 text-sm flex-col gap-2">
              <TrendingUp size={32} className="text-zinc-700" />
              <span>No revenue data yet</span>
            </div>
          )}
        </motion.div>

        {/* Recent bookings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="glass rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-all"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-white">{t('dashboard.recentBookings')}</h3>
            <Link href="/admin/bookings" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
              {t('dashboard.viewAll')} <ArrowRight size={12} className={isRTL ? 'rotate-180' : undefined} />
            </Link>
          </div>

          <div className="space-y-1">
            {data?.recentBookings?.length ? (
              data.recentBookings.slice(0, 6).map((b: any) => (
                <div key={b.id} className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-white/5 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-xs font-bold text-blue-400">
                      {(b.user?.name || 'G').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{b.user?.name || t('common.guest')}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {b.trip?.origin} → {b.trip?.destination} • {b.seatLabel}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-white">{b.total.toLocaleString()} {isRTL ? 'ج.م' : 'EGP'}</p>
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full',
                      b.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400' :
                      b.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-red-500/10 text-red-400'
                    )}>
                      {b.status === 'PAID' ? (isRTL ? 'مدفوع' : 'PAID') : t(`common.${b.status?.toLowerCase()}`)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-zinc-500 text-sm py-12 flex flex-col items-center gap-2">
                <Ticket size={28} className="text-zinc-700" />
                <span>{t('bookings.noBookings')}</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="mt-6 grid sm:grid-cols-3 gap-4"
      >
        {[
          {
            href: '/admin/buses',
            icon: Bus,
            color: 'blue',
            titleKey: 'dashboard.manageBuses',
            descKey: 'dashboard.addBuses',
          },
          {
            href: '/admin/trips',
            icon: Clock,
            color: 'emerald',
            titleKey: 'dashboard.manageTrips',
            descKey: 'dashboard.createTrips',
          },
          {
            href: '/trips',
            icon: Ticket,
            color: 'purple',
            titleKey: 'dashboard.viewTrips',
            descKey: 'dashboard.seeTrips',
          },
        ].map((action, i) => (
          <motion.div
            key={action.href}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + i * 0.08 }}
            whileHover={{ y: -3, scale: 1.02 }}
          >
            <Link
              href={action.href}
              className="block glass rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-all duration-200 group"
            >
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110',
                action.color === 'blue' && 'bg-blue-500/10 text-blue-400',
                action.color === 'emerald' && 'bg-emerald-500/10 text-emerald-400',
                action.color === 'purple' && 'bg-purple-500/10 text-purple-400',
              )}>
                <action.icon size={22} />
              </div>
              <h4 className="font-semibold text-white mb-1">{t(action.titleKey)}</h4>
              <p className="text-xs text-zinc-500">{t(action.descKey)}</p>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}